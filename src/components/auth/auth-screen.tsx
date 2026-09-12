"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Users,
  Clock,
  CheckSquare,
  Megaphone,
  Loader2,
  Sparkles,
  ArrowRight,
  Mail,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const resetToken = searchParams.get("reset")

  // Reset-password mode takes over the whole screen when ?reset=TOKEN is in
  // the URL. We render a dedicated "Set a new password" form and on success
  // we strip the query param and return to the login form.
  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={() => router.replace("/")} />
  }

  return <AuthScreenInner />
}

function AuthScreenInner() {
  const authView = useAppStore((s) => s.authView)
  const setAuthView = useAppStore((s) => s.setAuthView)
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-body-medium">Password</Label>
                  <button
                    type="button"
                    className="text-caption text-muted-foreground hover:text-club hover:underline"
                    onClick={() => setForgotOpen(true)}
                  >
                    Forgot password?
                  </button>
                </div>
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

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}

/**
 * Forgot-password dialog. Asks for an email and POSTs to
 * /api/auth/forgot-password. The endpoint is anti-enumeration — it always
 * returns { ok: true } — but if email delivery fails it also returns an
 * `error` field and a `resetUrl` (so devs / no-email-provider installs can
 * still recover). We surface both in the UI.
 */
function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetUrl, setResetUrl] = useState<string | null>(null)

  function handleClose(v: boolean) {
    if (!v) {
      // Reset state when closing so the next open is fresh.
      setEmail("")
      setError(null)
      setResetUrl(null)
      // Keep `done` so the success state persists for a beat after close —
      // but actually reset it too so reopening doesn't show stale success.
      setDone(false)
    }
    onOpenChange(v)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResetUrl(null)
    try {
      const res = await api<{ ok: boolean; error?: string; resetUrl?: string }>(
        "/api/auth/forgot-password",
        { method: "POST", json: { email } },
      )
      setDone(true)
      // Anti-enumeration: the endpoint returns ok:true even if the email
      // doesn't match an account. But if it also returned an `error` (e.g.
      // email provider not configured), surface that + the resetUrl fallback.
      if (res.error) setError(res.error)
      if (res.resetUrl) setResetUrl(res.resetUrl)
    } catch (err: any) {
      // Network / 500 — show the message.
      setError(err.message || "Couldn't send the reset link. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-club" />
            Reset your password
          </DialogTitle>
          <DialogDescription>
            Enter your account email and we&apos;ll send you a link to set a new password.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 rounded-lg border border-club/30 bg-club-muted/40 px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-club mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">If an account exists for <span className="font-mono">{email || "that email"}</span>, a reset link is on its way.</p>
                <p className="text-caption text-muted-foreground mt-1">Check your inbox (and spam folder). The link expires in 1 hour.</p>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Email couldn&apos;t be sent</p>
                  <p className="text-caption mt-0.5 break-words">{error}</p>
                  {resetUrl && (
                    <p className="text-caption mt-1.5 break-all">
                      Recovery link:{" "}
                      <a href={resetUrl} className="font-mono text-club underline break-all">
                        {resetUrl}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="club" onClick={() => handleClose(false)} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-body-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 pl-9"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" variant="club" disabled={loading || !email}>
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Send reset link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Reset-password screen — shown when the URL contains ?reset=TOKEN. Renders
 * a simple "Set a new password" form. On success, calls onDone() which
 * strips the query param and returns to the normal login screen.
 */
function ResetPasswordScreen({
  token,
  onDone,
}: {
  token: string
  onDone: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Password must contain a letter and a number.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setLoading(true)
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        json: { token, password },
      })
      toast.success("Password updated — sign in with your new password.")
      onDone()
    } catch (err: any) {
      setError(err.message || "Couldn't reset password. The link may have expired.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-background">
      <div className="w-full max-w-sm">
        <div className="md:hidden flex items-center justify-center gap-2 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-club text-club-foreground">
            <Users className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClubHub</span>
        </div>

        <div className="mb-6">
          <h1 className="text-page-title">Set a new password</h1>
          <p className="text-body text-muted-foreground mt-1.5">
            Choose a new password for your ClubHub account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password" className="text-body-medium">New password</Label>
            <Input
              id="reset-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 chars, 1 letter & 1 number"
              className="h-10"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm" className="text-body-medium">Confirm new password</Label>
            <Input
              id="reset-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter the new password"
              className="h-10"
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Minimum 8 characters with a letter and a number.
          </p>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" variant="club" className="w-full h-10" disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>
        </form>

        <p className="text-caption text-center mt-6 text-muted-foreground">
          <button
            type="button"
            className="text-club hover:underline font-medium"
            onClick={onDone}
          >
            Back to sign in
          </button>
        </p>
      </div>
    </div>
  )
}
