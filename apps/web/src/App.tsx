import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon, addCollection } from "@iconify/react";
import { icons as pixelIcons } from "@iconify-json/pixel";
import { BOSSRAID_DOCS_URL } from "@bossraid/ui";
import useSWR from "swr";
import { bindAsciiRipple } from "./ascii-ripple";
import { fetchJson, type Provider, type ProviderHealth } from "./api";
import { DemoPage } from "./pages/DemoPage";
import { LandingPage } from "./pages/LandingPage";
import { ReceiptPage } from "./pages/ReceiptPage";
import { RaidersPage } from "./pages/RaidersPage";

type AppRoute = "/" | "/demo" | "/raiders" | "/receipt";
type LandingTheme = "light" | "dark";

const LANDING_THEME_STORAGE_KEY = "bossraid.landing-theme";

addCollection(pixelIcons);

export function App() {
  const appShellRef = useRef<HTMLElement | null>(null);
  const pathname = useSyncExternalStore(subscribeToLocation, getCurrentRoute, () => "/");
  const [landingTheme, setLandingTheme] = useState<LandingTheme>(() => getInitialLandingTheme());
  const isLandingRoute = pathname === "/";
  const isDemoRoute = pathname === "/demo";
  const isRaidersRoute = pathname === "/raiders";
  const isReceiptRoute = pathname === "/receipt";
  const usesDirectoryLayout = isDemoRoute || isRaidersRoute || isReceiptRoute;

  const shouldLoadProviderData = isDemoRoute || isRaidersRoute;
  const providers = useSWR<Provider[]>(shouldLoadProviderData ? "/v1/providers" : null, (path: string) => fetchJson(path), {
    refreshInterval: 10_000,
  });
  const providerHealth = useSWR<ProviderHealth[]>(
    shouldLoadProviderData ? "/v1/providers/health" : null,
    (path: string) => fetchJson(path),
    { refreshInterval: 10_000 },
  );

  useEffect(() => {
    const root = appShellRef.current;
    if (!root) {
      return;
    }

    return bindAsciiRipple(root);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, landingTheme);
  }, [landingTheme]);

  function navigate(path: AppRoute) {
    if (getCurrentRoute() === path) {
      return;
    }

    startTransition(() => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0 });
    });
  }

  return (
    <main
      className={`app-shell ${isLandingRoute ? `app-shell--landing app-shell--theme-${landingTheme}` : ""} ${usesDirectoryLayout ? "app-shell--directory" : ""}`}
      ref={appShellRef}
    >
      <div className="bg-grid" aria-hidden="true" />

      {isRaidersRoute ? (
        <RaidersPage
          providers={providers.data ?? []}
          providerHealth={providerHealth.data ?? []}
          onNavigate={navigate}
        />
      ) : isDemoRoute ? (
        <DemoPage
          onNavigate={navigate}
          providerHealth={providerHealth.data ?? []}
          providers={providers.data ?? []}
        />
      ) : isReceiptRoute ? (
        <ReceiptPage onNavigate={navigate} />
      ) : (
        <LandingPage onNavigate={navigate} />
      )}

      <footer className="footer">
        <span className="footer__credit">
          © 2026 Boss Raid · Developed by{" "}
          <a href="https://ultima.gg" target="_blank" rel="noreferrer">
            Ultima
          </a>
        </span>
        <div className="footer__links">
          {isLandingRoute ? (
            <>
              <button
                className="footer__theme-toggle"
                onClick={() => setLandingTheme((current) => (current === "dark" ? "light" : "dark"))}
                type="button"
              >
                {landingTheme === "dark" ? "light mode" : "dark mode"}
              </button>
              <span aria-hidden="true" className="footer__separator">
                |
              </span>
            </>
          ) : null}
          <RouteLink active={pathname === "/"} label="home" onNavigate={navigate} path="/" />
          <RouteLink active={pathname === "/demo"} label="demo" onNavigate={navigate} path="/demo" />
          <RouteLink active={pathname === "/raiders"} label="raiders" onNavigate={navigate} path="/raiders" />
          <RouteLink active={pathname === "/receipt"} label="receipt" onNavigate={navigate} path="/receipt" />
          <a className="footer__docs-link" href={BOSSRAID_DOCS_URL} target="_blank" rel="noreferrer">
            docs
          </a>
          <a href="https://github.com/thomasjvu/mercenary" target="_blank" rel="noreferrer" aria-label="GitHub">
            <Icon className="icon icon--pixel" icon="pixel:github" />
          </a>
          <a href="https://x.com/ultima_gg" target="_blank" rel="noreferrer" aria-label="X">
            <Icon className="icon icon--pixel" icon="pixel:x" />
          </a>
        </div>
      </footer>
    </main>
  );
}

function RouteLink({
  active,
  label,
  onNavigate,
  path,
}: {
  active: boolean;
  label: string;
  onNavigate: (path: AppRoute) => void;
  path: AppRoute;
}) {
  return (
    <a
      className={`footer__route-link ${active ? "footer__route-link--active" : ""}`}
      href={path}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }

        event.preventDefault();
        onNavigate(path);
      }}
    >
      {label}
    </a>
  );
}

function normalizePathname(pathname: string): AppRoute {
  if (pathname === "/demo" || pathname === "/demo/") {
    return "/demo";
  }
  if (pathname === "/raiders" || pathname === "/raiders/") {
    return "/raiders";
  }
  if (pathname === "/receipt" || pathname === "/receipt/") {
    return "/receipt";
  }
  return "/";
}

function getCurrentRoute(): AppRoute {
  return typeof window === "undefined" ? "/" : normalizePathname(window.location.pathname);
}

function subscribeToLocation(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getInitialLandingTheme(): LandingTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
