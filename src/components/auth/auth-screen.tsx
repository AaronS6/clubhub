"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  Clock,
  CheckSquare,
  Megaphone,
  Loader2,
  Sparkles,
} from "lucide-react"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"

const VALUE_PROPS = [
  { icon: Users, title: "Multi-club workspaces", body: "One account, every club you belong to — fully isolated." },
  { icon: Clock, title: "Service hour tracking", body: "Submit, get approval, export official PDFs & CSV." },
  { icon: CheckSquare, title: "Tasks & teams", body: "Kanban boards, subtasks, and team-scoped work." },
  { icon: Megaphone, title: "Announcements & meetings", body: "Reactions, comments, RSVPs, calendar export." },
]

export function AuthScreen() {
  const authView = useAppStore((s) => s.authView)
  const setAuthView = useAppStore((s) => s.setAuthView)
  const [loading, setLoading] = useState(false)

  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const [signupName, setSignupName] = useState("")
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPassword, setSignupPassword] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      toast.error("Invalid email or password")
      return
    }
    toast.success("Welcome back!")
    setTimeout(() => window.location.reload(), 200)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api("/api/auth/signup", {
        method: "POST",
        json: { name: signupName, email: signupEmail, password: signupPassword },
      })
      const res = await signIn("credentials", {
        email: signupEmail,
        password: signupPassword,
        redirect: false,
      })
      if (res?.error) throw new Error("Login failed after signup")
      toast.success("Account created! Welcome to ClubHub.")
      setTimeout(() => window.location.reload(), 200)
    } catch (err: any) {
      toast.error(err.message || "Signup failed")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left: value proposition (hidden on small screens) */}
      <aside className="hidden md:flex md:w-1/2 lg:w-[55%] flex-col justify-between p-10 lg:p-14 bg-gradient-to-br from-emerald-50 via-background to-background dark:from-emerald-950/30 dark:via-background dark:to-background border-r border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-club text-club-foreground shadow-sm">
            <Users className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClubHub</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl lg:text-[2.5rem] lg:leading-[1.15] font-semibold tracking-tight">
            Run your clubs like a team.
          </h2>
          <p className="text-body text-muted-foreground mt-4 max-w-sm">
            A lightweight workspace for school clubs, volunteer orgs, and
            community groups — service hours, tasks, announcements, and meetings
            in one place.
          </p>

          <ul className="mt-8 space-y-4">
            {VALUE_PROPS.map((v) => {
              const Icon = v.icon
              return (
                <li key={v.title} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card border border-border text-club">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="text-card-title">{v.title}</div>
                    <div className="text-caption mt-0.5">{v.body}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="text-caption">
          Built for student leaders & volunteer coordinators.
        </p>
      </aside>

      {/* Right: auth form */}
      <main className="flex-1 flex flex-col justify-center px-5 py-10 sm:px-8 md:max-w-md md:mx-auto">
        {/* Mobile brand header */}
        <div className="md:hidden flex items-center justify-center gap-2 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-club text-club-foreground">
            <Users className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClubHub</span>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <div className="mb-6">
            <h1 className="text-page-title">
              {authView === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-body text-muted-foreground mt-1.5">
              {authView === "login"
                ? "Sign in to manage your clubs, tasks, and service hours."
                : "Join or create clubs to start collaborating."}
            </p>
          </div>

          {authView === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-body-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-body-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10"
                />
              </div>
              <Button type="submit" variant="club" className="w-full h-10" disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-body text-center text-muted-foreground">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-club hover:underline font-medium"
                  onClick={() => setAuthView("signup")}
                >
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-body-medium">Full name</Label>
                <Input
                  id="name"
                  required
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="Jane Doe"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-body-medium">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-body-medium">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  required
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="At least 8 chars, 1 letter & 1 number"
                  className="h-10"
                />
                <p className="text-caption mt-1">
                  Minimum 8 characters with a letter and a number.
                </p>
              </div>
              <Button type="submit" variant="club" className="w-full h-10" disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create account
              </Button>
              <p className="text-body text-center text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-club hover:underline font-medium"
                  onClick={() => setAuthView("login")}
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-caption text-center mt-10">
          By continuing you agree to use ClubHub responsibly.
        </p>
      </main>
    </div>
  )
}
