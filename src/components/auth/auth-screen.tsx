"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Users,
  Clock,
  CheckSquare,
  Megaphone,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"

/**
 * Durable, dedicated flag marking that this device has an existing account.
 * Separate from the general Zustand persisted store so it survives store
 * restructures/clears for unrelated reasons. On page load, if this flag is
 * present we default to the Sign In form (most returning users want that).
 * If absent (genuinely new device), we also default to Sign In — most new
 * visitors arrive by invitation (a shared club code) and need to make their
 * first account, so the prominent "Sign up" link is the right CTA.
 */
const HAS_ACCOUNT_KEY = "clubhub_has_account_on_device"

function readHasAccount(): boolean {
  try {
    return localStorage.getItem(HAS_ACCOUNT_KEY) === "1"
  } catch {
    return false
  }
}

function writeHasAccount() {
  try {
    localStorage.setItem(HAS_ACCOUNT_KEY, "1")
  } catch {
    // ignore — private mode / storage disabled
  }
}

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

  // Returning-user logic: default to "login" view. The dedicated localStorage
  // flag is a hint, but both paths land on login-first — the flag is mainly
  // for future analytics / onboarding decisions.
  useEffect(() => {
    const hasAccount = readHasAccount()
    if (!hasAccount && authView !== "signup") {
      // New device — still default to login with a clear sign-up link.
      setAuthView("login")
    }
  }, [setAuthView, authView])

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
    writeHasAccount()
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
      writeHasAccount()
      toast.success("Account created! Welcome to ClubHub.")
      setTimeout(() => window.location.reload(), 200)
    } catch (err: any) {
      toast.error(err.message || "Signup failed")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left: value proposition (hidden on small screens).
          Solid colors only — no gradients. Visual interest comes from a
          subtle dot-grid texture + a soft accent blob (flat, blurred, not a
          gradient). */}
      <aside className="hidden md:flex md:w-1/2 lg:w-[55%] flex-col justify-between p-10 lg:p-14 bg-club-subtle/60 dark:bg-club-subtle/20 border-r border-border relative overflow-hidden">
        {/* Dot-grid texture — very low opacity, barely visible. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.15] dark:opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            color: "var(--foreground)",
          }}
        />
        {/* Soft accent blob — flat color with blur, NOT a gradient. Positioned
            off-canvas in the top-right corner as a decorative shape. */}
        <div
          aria-hidden
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-club/20 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-club text-club-foreground shadow-sm">
            <Users className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClubHub</span>
        </div>

        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-club-muted px-2.5 py-1 text-caption-medium font-medium text-club mb-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Sparkles className="h-3 w-3" />
            For student leaders & volunteer coordinators
          </div>
          <h2 className="text-3xl lg:text-[2.5rem] lg:leading-[1.15] font-semibold tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
            Run your clubs like a team.
          </h2>
          <p className="text-body text-muted-foreground mt-4 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
            A lightweight workspace for school clubs, volunteer orgs, and
            community groups.
          </p>

          <ul className="mt-8 space-y-3.5">
            {VALUE_PROPS.map((v, i) => {
              const Icon = v.icon
              return (
                <li
                  key={v.title}
                  className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500"
                  style={{ animationDelay: `${200 + i * 80}ms` }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card border border-border text-club shadow-sm">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-card-title">{v.title}</div>
                    <div className="text-caption mt-0.5 text-muted-foreground">{v.body}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="relative text-caption text-muted-foreground">
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
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Sign in
              </Button>
              <p className="text-body text-center text-muted-foreground">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-club hover:underline font-medium inline-flex items-center gap-0.5"
                  onClick={() => setAuthView("signup")}
                >
                  Sign up
                  <ArrowRight className="h-3 w-3" />
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
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="text-body text-center text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-club hover:underline font-medium inline-flex items-center gap-0.5"
                  onClick={() => setAuthView("login")}
                >
                  Sign in
                  <ArrowRight className="h-3 w-3" />
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-caption text-center mt-10 text-muted-foreground">
          By continuing you agree to use ClubHub responsibly.
        </p>
      </main>
    </div>
  )
}
