import { SignIn } from '@clerk/nextjs';

/**
 * Catch-all sign-in route. Clerk renders and routes the whole flow.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <SignIn />
    </div>
  );
}
