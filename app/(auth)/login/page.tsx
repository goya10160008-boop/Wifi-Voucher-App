import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  // Only the exact value "idle" changes anything; nothing from the URL is ever rendered.
  return <LoginForm idle={reason === 'idle'} />;
}
