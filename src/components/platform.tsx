"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  ChevronDown,
  Compass,
  FolderHeart,
  CodeXml,
  Layers3,
  Menu,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from "lucide-react";
export type User = {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  adultOptIn: boolean;
  verified: boolean;
};
type Context = {
  user: User | null;
  refresh: () => Promise<void>;
  toast: (text: string) => void;
};
const PlatformContext = createContext<Context>({
  user: null,
  refresh: async () => {},
  toast: () => {},
});
export const usePlatform = () => useContext(PlatformContext);
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    try {
      const data = await api<{ user: User | null }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <PlatformContext.Provider value={{ user, refresh, toast: setMessage }}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            onClick={() => setMessage("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </PlatformContext.Provider>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { user } = usePlatform();
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [accent, setAccent] = useState("copper");
  useEffect(() => {
    const t = localStorage.getItem("komfy-theme") || "dark",
      a = localStorage.getItem("komfy-accent") || "copper";
    setTheme(t);
    setAccent(a);
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.accent = a;
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("komfy-theme", next);
    document.documentElement.dataset.theme = next;
  }
  function chooseAccent(a: string) {
    setAccent(a);
    localStorage.setItem("komfy-accent", a);
    document.documentElement.dataset.accent = a;
  }
  return (
    <>
      <header className="header">
        <div className="brand-side">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            <Menu size={21} />
          </button>
          <Link className="brand" href="/">
            <span className="brand-symbol">
              <Layers3 size={25} strokeWidth={1.6} />
            </span>
            komfyflow<span className="beta">BETA</span>
          </Link>
        </div>
        <nav className="top-nav">
          <Link className={path === "/" ? "active" : ""} href="/">
            Discover
          </Link>
          <Link
            className={path.startsWith("/collections") ? "active" : ""}
            href="/collections"
          >
            Collections
          </Link>
          <a href="https://docs.comfy.org/" target="_blank" rel="noreferrer">
            Learn <ArrowUpRight size={12} />
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/upload" className="button small upload-top">
            <Plus size={16} /> Share workflow
          </Link>
          <Link
            href={user ? "/account" : "/auth"}
            className={user ? "avatar" : "sign-in"}
          >
            {user ? user.username.slice(0, 2).toUpperCase() : "Sign in"}
          </Link>
        </div>
      </header>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="side-label">WORKSPACE</div>
        <Link
          onClick={() => setMobile(false)}
          className={`side-link ${path === "/" ? "selected" : ""}`}
          href="/"
        >
          <Compass size={18} /> Explore workflows <span className="side-dot" />
        </Link>
        <Link
          onClick={() => setMobile(false)}
          className={`side-link ${path === "/collections" ? "selected" : ""}`}
          href="/collections"
        >
          <FolderHeart size={18} /> My collections
        </Link>
        <Link
          onClick={() => setMobile(false)}
          className={`side-link ${path === "/account" ? "selected" : ""}`}
          href="/account"
        >
          <Bookmark size={17} /> Saved & activity
        </Link>
        <div className="side-divider" />
        <div className="side-label">CREATE SOMETHING</div>
        <Link
          onClick={() => setMobile(false)}
          className="side-link"
          href="/?category=Image"
        >
          <span className="category-icon pink">✧</span> Image generation
        </Link>
        <Link
          onClick={() => setMobile(false)}
          className="side-link"
          href="/?category=Video"
        >
          <span className="category-icon blue">▹</span> Video & motion
        </Link>
        <Link
          onClick={() => setMobile(false)}
          className="side-link"
          href="/?category=Upscaling"
        >
          <span className="category-icon gold">↗</span> Upscaling & detail
        </Link>
        <Link
          onClick={() => setMobile(false)}
          className="side-link"
          href="/?category=3D"
        >
          <span className="category-icon green">◇</span> 3D & spatial
        </Link>
        <div className="sidebar-bottom">
          <div className="community-card">
            <span className="eyebrow">BETTER, TOGETHER</span>
            <h3>Your next idea starts here.</h3>
            <p>
              Share the process.
              <br />
              Not just the pixels.
            </p>
            <Link href="/upload">
              Share a workflow <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="appearance">
            <span>Make it yours</span>
            <div className="swatches">
              {["copper", "violet", "teal", "blue"].map((a) => (
                <button
                  key={a}
                  className={`swatch ${a} ${accent === a ? "chosen" : ""}`}
                  onClick={() => chooseAccent(a)}
                  aria-label={`${a} accent`}
                  aria-pressed={accent === a}
                />
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <span>Made for the makers.</span>
            <a
              href="https://github.com/Comfy-Org/ComfyUI"
              target="_blank"
              rel="noreferrer"
              aria-label="ComfyUI on GitHub"
            >
              <CodeXml size={15} />
            </a>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <main className="main">{children}</main>
      <footer className="main-footer">
        <span>
          komfyflow{" "}
          <span className="muted">/ An open canvas for your next idea.</span>
        </span>
        <span>
          Built around ComfyUI <ArrowUpRight size={12} />
        </span>
      </footer>
    </>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Layers3 size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow accent-text">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
