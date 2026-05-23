import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import ellineLogo from "@/assets/elline-logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const quickLogin = async (demoEmail: string, demoPassword: string) => {
    setError("");
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    try {
      const { error } = await login(demoEmail, demoPassword);
      if (error) { setError(error); return; }
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (isSignUp && !username) {
      setError("Please enter a username");
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signup(email, password, username);
        if (error) { setError(error); return; }
        navigate("/");
      } else {
        const { error } = await login(email, password);
        if (error) { setError(error); return; }
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-accent flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent via-accent to-secondary/30" />
        <div className="relative z-10 text-center">
          <img src={ellineLogo} alt="Elline Food Products" width={160} height={160} className="mx-auto mb-6" />
          <h2 className="text-lg font-body font-medium text-muted-foreground mb-4">Elline Food Products</h2>
          <h1 className="font-heading text-5xl font-bold text-foreground leading-tight">
            Login to<br />
            <span className="text-primary">System</span>
          </h1>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-card">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex justify-center mb-4">
            <img src={ellineLogo} alt="Elline Food Products" width={80} height={80} />
          </div>
          <div>
            <h2 className="font-heading text-3xl font-bold text-foreground">
              {isSignUp ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="text-muted-foreground mt-2 font-body">
              {isSignUp ? "Sign up to get started" : "Please enter your credentials to continue"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</Label>
                <Input id="username" placeholder="Your name" value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 bg-background border-border" />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input id="email" type="email" placeholder="admin@ellinefood.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-background border-border" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-background border-border pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <p className="text-destructive text-sm font-medium">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base gap-2">
              {loading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"} <ArrowRight size={18} />
            </Button>
          </form>

          {!isSignUp && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Login</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" disabled={loading} onClick={() => quickLogin("admin@gmail.com", "admin123")} className="h-11">
                  Admin
                </Button>
                <Button type="button" variant="outline" disabled={loading} onClick={() => quickLogin("user@gmail.com", "user123")} className="h-11">
                  User
                </Button>
              </div>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
