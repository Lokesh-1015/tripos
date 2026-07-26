import { SignUp } from '@clerk/nextjs';

/**
 * Catch-all sign-up route.
 *
 * This is the most conversion-sensitive screen in the product: an invited member
 * lands here, and a trip with one member has no value (docs/prd-review.md §4.8).
 * Keep it fast and free of redirects.
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <SignUp />
    </div>
  );
}
