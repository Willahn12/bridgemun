import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign in | BridgeMUN" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { created } = await searchParams;
  return <AuthForm mode="signin" created={created === "1" || created === "confirm" ? created : undefined} />;
}
