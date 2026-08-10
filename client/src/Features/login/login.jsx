import { LoginForm } from "@/components/ui/login-form"

function LoginPage() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background p-6 text-foreground md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  )
}

export default LoginPage
