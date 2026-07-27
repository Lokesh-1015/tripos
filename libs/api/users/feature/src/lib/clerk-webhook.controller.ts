import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '@tripos/api/shared/auth';
import { SyncClerkUserUseCase, type ClerkUserEventType } from '@tripos/api/users/application';
import { verifyWebhook } from '@clerk/backend/webhooks';
import type { IncomingMessage } from 'node:http';
import { CLERK_WEBHOOK_SIGNING_SECRET } from './users.tokens';

/** Nest attaches the raw body when the app is created with `rawBody: true`. */
type RawBodyRequest = IncomingMessage & { rawBody?: Buffer };

const HANDLED_EVENTS: readonly string[] = [
  'user.created',
  'user.updated',
  'user.deleted',
] satisfies readonly ClerkUserEventType[];

/**
 * Receives Clerk user webhooks and keeps the local `User` table in sync.
 *
 * Security notes, because this endpoint is unauthenticated by design:
 *  - Every payload is signature-verified against CLERK_WEBHOOK_SIGNING_SECRET.
 *    An unverified webhook would let anyone create or delete users.
 *  - Verification uses the RAW body. Parsing before verifying would change the
 *    bytes and break the signature, so `rawBody: true` is set in main.ts.
 *  - We never log the payload — it contains email addresses (CLAUDE.md §14).
 */
// Clerk's servers hold no TripOS session. This route is unauthenticated by
// necessity and authenticated by SIGNATURE instead — see the verification below,
// which is what makes @Public() safe here.
@Public()
@Controller('webhooks')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly syncUser: SyncClerkUserUseCase,
    @Inject(CLERK_WEBHOOK_SIGNING_SECRET) private readonly signingSecret: string | undefined,
  ) {}

  @Post('clerk')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() req: RawBodyRequest): Promise<{ received: true; action: string }> {
    if (!this.signingSecret) {
      // Fail loudly rather than accepting unverified payloads.
      throw new ServiceUnavailableException('Clerk webhook signing secret is not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body unavailable; cannot verify signature');
    }

    // Rebuild a standard Request so Clerk's verifier sees the exact bytes and the
    // svix-* headers it signed over.
    const request = new Request('https://tripos.invalid/api/webhooks/clerk', {
      method: 'POST',
      headers: new Headers(
        Object.entries(req.headers).flatMap(([key, value]): [string, string][] => {
          if (typeof value === 'string') return [[key, value]];
          if (Array.isArray(value)) return value.map((v): [string, string] => [key, v]);
          return [];
        }),
      ),
      body: rawBody,
    });

    let event: Awaited<ReturnType<typeof verifyWebhook>>;
    try {
      event = await verifyWebhook(request, { signingSecret: this.signingSecret });
    } catch {
      // Deliberately opaque: a caller who cannot sign should learn nothing.
      throw new BadRequestException('Invalid webhook signature');
    }

    if (!HANDLED_EVENTS.includes(event.type)) {
      // Returning 200 stops Clerk retrying an event we intentionally ignore.
      this.logger.debug(`Ignoring unhandled Clerk event: ${event.type}`);
      return { received: true, action: 'ignored' };
    }

    const data = event.data as {
      id: string;
      email_addresses?: { email_address: string; id: string }[];
      primary_email_address_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      image_url?: string | null;
    };

    const outcome = await this.syncUser.execute({
      type: event.type as ClerkUserEventType,
      clerkUserId: data.id,
      ...(event.type === 'user.deleted'
        ? {}
        : {
            attributes: {
              email: selectPrimaryEmail(data),
              firstName: data.first_name ?? null,
              lastName: data.last_name ?? null,
              username: data.username ?? null,
              avatarUrl: data.image_url ?? null,
            },
          }),
    });

    // Log the identifier and the outcome — never the email or the payload.
    this.logger.log(`Clerk ${event.type} for ${data.id}: ${outcome.action}`);

    return { received: true, action: outcome.action };
  }
}

/**
 * Clerk sends every address plus a pointer to the primary one. Picking the
 * primary matters: users often add a work address later, and syncing the wrong
 * one would send trip invitations somewhere they don't read.
 */
function selectPrimaryEmail(data: {
  email_addresses?: { email_address: string; id: string }[];
  primary_email_address_id?: string | null;
}): string | null {
  const addresses = data.email_addresses ?? [];
  const primary = addresses.find((address) => address.id === data.primary_email_address_id);

  return primary?.email_address ?? addresses[0]?.email_address ?? null;
}
