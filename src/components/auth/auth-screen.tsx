"use client"

import { useState, useEffect, useRef } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  ArrowRight,
  AlertTriangle,
  LifeBuoy,
  X,
} from "lucide-react"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { APP_VERSION } from "@/lib/version"

// ───────────────────────────────────────────────────────────────────────────
// First-visit / returning-visitor flag.
//   • first visit (no flag)       → default to Sign Up
//   • returning visitor (flag=1)  → default to Log In
//   • manual tab switches         → never touch the flag
//   • only a real signup/login    → sets the flag
// The mount effect below is authoritative (overrides persisted authView).
// ───────────────────────────────────────────────────────────────────────────
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

export function AuthScreen() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // ?reset=TOKEN → emailed (or legacy exec-generated) reset link. Both
  // `reset` (current) and `resetToken` (older links) are accepted.
  const resetToken = searchParams.get("reset") || searchParams.get("resetToken")

  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={() => router.replace("/")} />
  }

  return <AuthScreenInner />
}

function AuthScreenInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const authView = useAppStore((s) => s.authView)
  const setAuthView = useAppStore((s) => s.setAuthView)
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const [signupName, setSignupName] = useState("")
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPassword, setSignupPassword] = useState("")

  // Mount-only: default view from the durable flag.
  // The `?auth=login|signup` param (linked from the public landing page's
  // Log In / Sign Up buttons) takes precedence so the visitor lands on the
  // tab they asked for; without it the behavior is unchanged — first visit
  // defaults to Sign Up, returning visitors to Log In.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const authParam = searchParams.get("auth")
    if (authParam === "login" || authParam === "signup") {
      setAuthView(authParam)
      return
    }
    setAuthView(readHasAccount() ? "login" : "signup")
  }, [setAuthView, searchParams])

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
      toast.success("Account created!")
      setTimeout(() => window.location.reload(), 200)
    } catch (err: any) {
      toast.error(err.message || "Signup failed")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f1e8] text-[#1a1815] dark:bg-[#16130e] dark:text-[#f0ebe0]">
      {/* ── Header (in-flow at top — never overlaps anything) ─────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between px-5 sm:px-8 py-5 shrink-0"
      >
        <span className="text-xl font-extrabold tracking-tight">ClubHub</span>
        {/* Back to the public landing page — always available on the auth
            screen (login + signup tabs). Matches the editorial square style. */}
        <button
          type="button"
          onClick={() => router.replace("/")}
          aria-label="Back to home"
          title="Back to home"
          className="inline-flex h-9 w-9 items-center justify-center rounded-none border border-[#1a1815]/15 dark:border-[#f0ebe0]/15 text-[#1a1815]/70 dark:text-[#f0ebe0]/70 hover:text-club hover:border-club/60 hover:bg-club/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.header>

      {/* ── Two-column body (in-flow flex). Each column is bounded so the
          hero can NEVER cross into the form column. Stacks on mobile. ───── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Left: hero typography — desktop only, in a bounded column with
            real padding separating it from the form column on the right. */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="hidden md:flex md:w-[55%] lg:w-[58%] flex-col px-8 lg:px-12 xl:px-16 py-8 border-r border-[#1a1815]/10 dark:border-[#f0ebe0]/10"
        >
          <div className="flex-1 flex items-center">
            <h1
              className="font-black tracking-tighter leading-[0.92] text-[#1a1815] dark:text-[#f0ebe0] break-words"
              style={{ fontSize: "clamp(2.75rem, 6vw, 5rem)", letterSpacing: "-0.04em" }}
            >
              For the
              <br />
              people who
              <br />
              run things.
            </h1>
          </div>
          <p className="text-xs font-medium text-[#1a1815]/45 dark:text-[#f0ebe0]/45 shrink-0">
            Built for student leaders &amp; volunteer coordinators.
          </p>
        </motion.section>

        {/* Right: form column — bounded, never overlapped by the hero. */}
        <main className="flex-1 md:w-[45%] lg:w-[42%] flex items-center justify-center px-5 sm:px-8 py-6 md:py-8">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            className="w-full max-w-sm"
          >
          {/* Mobile tagline (in-flow, below the header — no overlap) */}
          <div className="md:hidden mb-6">
            <h2 className="text-2xl font-black tracking-tight leading-[1.1]" style={{ letterSpacing: "-0.03em" }}>
              For the people who run things.
            </h2>
            <p className="text-sm text-[#1a1815]/60 dark:text-[#f0ebe0]/60 mt-1.5">
              The workspace for school clubs &amp; volunteer orgs.
            </p>
          </div>

          {/* Desktop form heading */}
          <div className="hidden md:block mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.025em" }}>
              {authView === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-sm text-[#1a1815]/60 dark:text-[#f0ebe0]/60 mt-1.5">
              {authView === "login"
                ? "Your clubs, tasks, and hours."
                : "Join a club or create your own."}
            </p>
          </div>

          {/* Google sign-in — shared across both login + signup modes.
              Premium feel: subtle layered border, hairline shadow on hover,
              smooth lift on hover. The Google logo keeps its brand colors. */}
          <div className="space-y-3">
            <motion.button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.995 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="group flex items-center justify-center gap-2.5 w-full h-11 rounded-md border border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-card text-sm font-medium hover:border-[#1a1815]/30 dark:hover:border-[#f0ebe0]/30 hover:shadow-[0_4px_12px_rgba(26,24,21,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-[border-color,box-shadow]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              {authView === "login" ? "Continue with Google" : "Sign up with Google"}
            </motion.button>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#1a1815]/10 dark:bg-[#f0ebe0]/10" />
              <span className="text-xs text-[#1a1815]/40 dark:text-[#f0ebe0]/40">or</span>
              <div className="flex-1 h-px bg-[#1a1815]/10 dark:bg-[#f0ebe0]/10" />
            </div>
          </div>

          {/* Cross-fade on mode switch — keyed on authView so motion re-runs
              the entrance each time the user toggles login/signup. */}
          <motion.div
            key={authView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {authView === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-bold tracking-wide uppercase">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 rounded-none border-0 border-b-2 border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-transparent px-0 py-2.5 text-base transition-colors focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-bold tracking-wide uppercase">Password</Label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#1a1815]/55 dark:text-[#f0ebe0]/55 hover:text-club hover:underline transition-colors"
                      onClick={() => setForgotOpen(true)}
                    >
                      Forgot?
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
                    className="h-12 rounded-none border-0 border-b-2 border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-transparent px-0 py-2.5 text-base transition-colors focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"
                  />
                </div>
                <Button
                  type="submit"
                  variant="club"
                  className="w-full h-12 rounded-none text-base font-bold tracking-wide uppercase shadow-none hover:brightness-105 active:scale-[0.99] transition-[filter,transform] duration-150"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Sign in
                </Button>
                <p className="text-sm text-center text-[#1a1815]/55 dark:text-[#f0ebe0]/55 pt-1">
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className="text-club hover:underline font-bold inline-flex items-center gap-0.5 transition-opacity"
                    onClick={() => setAuthView("signup")}
                  >
                    Sign up
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-bold tracking-wide uppercase">Full name</Label>
                  <Input
                    id="name"
                    required
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Jane Doe"
                    className="h-12 rounded-none border-0 border-b-2 border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-transparent px-0 py-2.5 text-base transition-colors focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-bold tracking-wide uppercase">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 rounded-none border-0 border-b-2 border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-transparent px-0 py-2.5 text-base transition-colors focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-bold tracking-wide uppercase">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    required
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="8+ chars, 1 letter & 1 number"
                    className="h-12 rounded-none border-0 border-b-2 border-[#1a1815]/15 dark:border-[#f0ebe0]/15 bg-transparent px-0 py-2.5 text-base transition-colors focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"
                  />
                </div>
                <Button
                  type="submit"
                  variant="club"
                  className="w-full h-12 rounded-none text-base font-bold tracking-wide uppercase shadow-none hover:brightness-105 active:scale-[0.99] transition-[filter,transform] duration-150"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
                <p className="text-sm text-center text-[#1a1815]/55 dark:text-[#f0ebe0]/55 pt-1">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-club hover:underline font-bold inline-flex items-center gap-0.5 transition-opacity"
                    onClick={() => setAuthView("login")}
                  >
                    Sign in
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </p>
              </form>
            )}
          </motion.div>

          {/* Footer note — mobile only (desktop footer is in the left column) */}
          <p className="md:hidden text-center text-xs text-[#1a1815]/40 dark:text-[#f0ebe0]/40 mt-6">
            By continuing you agree to use ClubHub responsibly.
          </p>
        </motion.div>
      </main>
      </div>

      {/* Version marker + maker credit — small, bottom corners. */}
      <span className="absolute bottom-3 right-4 text-xs font-medium text-[#1a1815]/35 dark:text-[#f0ebe0]/35 select-none pointer-events-none">
        v{APP_VERSION}
      </span>
      <span className="absolute bottom-3 left-4 text-xs font-medium text-[#1a1815]/45 dark:text-[#f0ebe0]/45 select-none pointer-events-none">
        Made by Aaron Shan
      </span>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}

/**
 * Forgot-password dialog — the real email-based flow.
 *
 * POSTs the address to /api/auth/forgot-password, which generates a
 * single-use 1-hour reset token and emails the link via Resend
 * (https://resend.com — set RESEND_API_KEY + EMAIL_FROM in .env). The API
 * is anti-enumeration (always ok:true) so the dialog can't reveal whether
 * an address is registered; it just says "check your inbox".
 *
 * Dev fallback: without RESEND_API_KEY the API (non-production only)
 * returns resetUrl in the response so the flow stays testable — we surface
 * it as a direct "Open reset link" button instead of an email.
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
  const [sent, setSent] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Fresh state whenever the dialog is reopened.
  useEffect(() => {
    if (open) {
      setEmail("")
      setSent(false)
      setDevResetUrl(null)
      setErrorMsg(null)
      setLoading(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    if (!email.trim()) return
    setLoading(true)
    try {
      const res = await api<{ ok: boolean; resetUrl?: string; error?: string }>(
        "/api/auth/forgot-password",
        { method: "POST", json: { email: email.trim() } },
      )
      setSent(true)
      // Non-production convenience: no RESEND_API_KEY → the API hands back
      // the reset link directly so the flow is demoable before email is set up.
      if (res?.resetUrl) setDevResetUrl(res.resetUrl)
    } catch (err: any) {
      setErrorMsg(err?.message || "Something went wrong. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "h-12 rounded-none border-0 border-b-2 border-[#1a1815]/20 dark:border-[#f0ebe0]/20 bg-transparent px-0 py-2.5 text-base focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-none border-2 border-[#1a1815] dark:border-[#f0ebe0] bg-[#f6f1e8] dark:bg-[#16130e] p-7 sm:p-8 gap-0 shadow-[6px_6px_0_0_var(--club-accent,#10b981)]">
        <DialogHeader className="mb-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-none bg-club text-club-foreground">
              <LifeBuoy className="h-4 w-4" />
            </span>
            {sent ? "Check your inbox" : "Reset your password"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {sent
              ? "A password-reset link has been requested."
              : "Enter your email to receive a password-reset link."}
          </DialogDescription>
        </DialogHeader>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm leading-relaxed text-[#1a1815]/80 dark:text-[#f0ebe0]/80">
              We&apos;ll email you a reset link. It expires in 1 hour.
            </p>
            <div className="space-y-2">
              <Label
                htmlFor="forgot-email"
                className="text-sm font-bold tracking-wide uppercase"
              >
                Email
              </Label>
              <Input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                className={inputCls}
                autoFocus
              />
            </div>
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-none border border-danger/30 bg-danger-subtle px-3.5 py-3 text-sm text-danger-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            <Button
              type="submit"
              variant="club"
              disabled={loading}
              className="w-full h-11 rounded-none font-bold tracking-wide uppercase shadow-none hover:brightness-105"
            >
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Send reset link
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-[#1a1815]/55 dark:text-[#f0ebe0]/55 hover:text-club hover:underline transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <div className="space-y-3.5">
            <p className="text-sm leading-relaxed">
              If an account exists for{" "}
              <strong className="font-bold break-all">{email.trim()}</strong>, a
              reset link is on its way.
            </p>
            <div className="flex items-start gap-2.5 rounded-none border border-[#1a1815]/15 dark:border-[#f0ebe0]/15 px-3.5 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-club" />
              <div>
                <p className="font-bold">Didn&apos;t get it?</p>
                <p className="text-xs text-[#1a1815]/60 dark:text-[#f0ebe0]/60 mt-0.5">
                  Check spam and the address, then try again. Nothing arrives if
                  the email isn&apos;t registered.
                </p>
              </div>
            </div>

            {devResetUrl ? (
              <div className="rounded-none border-2 border-dashed border-club/50 px-3.5 py-3.5">
                <p className="text-xs font-bold tracking-wide uppercase text-club">
                  Email not configured on this install
                </p>
                <p className="text-xs text-[#1a1815]/60 dark:text-[#f0ebe0]/60 mt-1 leading-relaxed">
                  Add RESEND_API_KEY in .env to send real emails. For now, use
                  the link directly:
                </p>
                <Button
                  type="button"
                  variant="club"
                  onClick={() => {
                    // Navigate on the CURRENT origin (works behind proxies /
                    // preview iframes) — extract just the token from the URL
                    // the API returned rather than jumping to its host.
                    try {
                      const u = new URL(devResetUrl, window.location.origin)
                      const token =
                        u.searchParams.get("reset") || u.searchParams.get("resetToken")
                      window.location.href = token
                        ? `/?reset=${encodeURIComponent(token)}`
                        : "/"
                    } catch {
                      window.location.href = "/"
                    }
                  }}
                  className="mt-3 w-full h-10 rounded-none font-bold tracking-wide uppercase shadow-none hover:brightness-105"
                >
                  Open reset link
                </Button>
              </div>
            ) : null}

            <Button
              variant="club"
              onClick={() => onOpenChange(false)}
              className="w-full h-11 rounded-none font-bold tracking-wide uppercase shadow-none hover:brightness-105"
            >
              Back to sign in
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Reset-password screen — shown when the URL contains ?reset=TOKEN (the
 * link we emailed via Resend). Same editorial treatment as the auth screen.
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
      setError("At least 8 characters.")
      return
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Needs a letter and a number.")
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
      toast.success("Password updated.")
      onDone()
    } catch (err: any) {
      setError(err.message || "Couldn't reset password. The link may have expired.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "h-12 rounded-none border-0 border-b-2 border-[#1a1815]/20 dark:border-[#f0ebe0]/20 bg-transparent px-0 py-2.5 text-base focus-visible:border-club focus-visible:ring-0 placeholder:text-[#1a1815]/35 dark:placeholder:text-[#f0ebe0]/35"

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f1e8] text-[#1a1815] dark:bg-[#16130e] dark:text-[#f0ebe0]">
      {/* Wordmark */}
      <header className="absolute top-0 left-0 z-10 p-6 sm:p-8 flex items-center">
        <span className="text-xl font-extrabold tracking-tight">ClubHub</span>
      </header>

      <main className="relative min-h-screen flex items-center justify-center px-5 py-10">
        <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-6">
            <h1 className="text-3xl font-black tracking-tight leading-[1.05]">
              Set a new password.
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-sm font-bold tracking-wide uppercase">New password</Label>
              <Input
                id="reset-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ chars, 1 letter & 1 number"
                className={inputCls}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm" className="text-sm font-bold tracking-wide uppercase">Confirm password</Label>
              <Input
                id="reset-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter the new password"
                className={inputCls}
              />
            </div>
            {error && (
              <div className="flex items-start gap-2.5 rounded-none border border-danger/30 bg-danger-subtle px-3.5 py-3 text-sm text-danger-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button
              type="submit"
              variant="club"
              className="w-full h-12 rounded-none text-base font-bold tracking-wide uppercase shadow-none hover:brightness-105 active:scale-[0.99]"
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>

          <p className="text-center mt-6">
            <button
              type="button"
              className="text-sm font-bold text-club hover:underline"
              onClick={onDone}
            >
              Back to sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
