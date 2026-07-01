import { useLocation } from "react-router-dom";
import "./PageSkeleton.css";

function Bone({ w, h, r }: { w?: string; h?: string; r?: string }) {
  return (
    <div
      className="skel-bone"
      style={{ width: w ?? "100%", height: h ?? "16px", borderRadius: r ?? "6px" }}
    />
  );
}

function HomeSkeleton() {
  return (
    <div className="page skel-page">
      <div className="skel-hero">
        <div className="skel-hero-copy">
          <Bone w="48%" h="14px" />
          <Bone w="72%" h="40px" r="8px" />
          <Bone w="60%" h="40px" r="8px" />
          <Bone w="180px" h="16px" />
          <div className="skel-hero-actions">
            <Bone w="140px" h="42px" r="8px" />
            <Bone w="120px" h="42px" r="8px" />
          </div>
        </div>
      </div>

      <div className="skel-card-grid skel-card-grid--3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skel-card">
            <Bone w="48px" h="48px" r="10px" />
            <Bone w="60%" h="18px" />
            <Bone w="80%" h="13px" />
            <Bone w="50%" h="13px" />
          </div>
        ))}
      </div>

      <div className="skel-card-grid skel-card-grid--4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel-card skel-card--metric">
            <Bone w="40%" h="13px" />
            <Bone w="55%" h="32px" r="8px" />
          </div>
        ))}
      </div>

      <div className="skel-card skel-card--panel">
        <div className="skel-panel-header">
          <Bone w="180px" h="18px" />
          <Bone w="80px" h="32px" r="7px" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel-row">
            <Bone w="36px" h="36px" r="8px" />
            <div className="skel-row-body">
              <Bone w="55%" h="14px" />
              <Bone w="35%" h="12px" />
            </div>
            <Bone w="70px" h="28px" r="6px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="page skel-page">
      <div className="skel-topbar">
        <div>
          <Bone w="160px" h="22px" />
          <Bone w="240px" h="13px" />
        </div>
        <Bone w="120px" h="38px" r="8px" />
      </div>

      <div className="skel-filters">
        <Bone w="100%" h="40px" r="8px" />
        <div className="skel-filter-chips">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} w="90px" h="32px" r="20px" />
          ))}
        </div>
      </div>

      <div className="skel-card skel-card--panel">
        <div className="skel-panel-header">
          <Bone w="200px" h="18px" />
          <Bone w="60px" h="14px" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel-row">
            <Bone w="36px" h="36px" r="8px" />
            <div className="skel-row-body">
              <Bone w={`${50 + (i % 3) * 12}%`} h="14px" />
              <Bone w="30%" h="12px" />
            </div>
            <Bone w="56px" h="28px" r="6px" />
            <Bone w="56px" h="28px" r="6px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetySkeleton() {
  return (
    <div className="page skel-page">
      <div className="skel-topbar">
        <div>
          <Bone w="55%" h="26px" />
          <Bone w="40%" h="13px" />
        </div>
      </div>

      <div className="skel-card-grid skel-card-grid--4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel-card skel-card--metric">
            <Bone w="48px" h="48px" r="50%" />
            <Bone w="50%" h="30px" r="8px" />
            <Bone w="70%" h="13px" />
          </div>
        ))}
      </div>

      <div className="skel-card-grid skel-card-grid--2">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="skel-card skel-card--panel">
            <div className="skel-panel-header">
              <Bone w="160px" h="18px" />
              <Bone w="70px" h="30px" r="7px" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skel-row">
                <Bone w="32px" h="32px" r="50%" />
                <div className="skel-row-body">
                  <Bone w={`${45 + (i % 3) * 10}%`} h="13px" />
                  <Bone w="30%" h="12px" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="page skel-page">
      <div className="skel-topbar">
        <div>
          <Bone w="140px" h="24px" />
          <Bone w="260px" h="13px" />
        </div>
      </div>

      <div className="skel-card-grid skel-card-grid--2">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="skel-card skel-card--panel">
            <div className="skel-panel-header">
              <Bone w="150px" h="18px" />
              <Bone w="80px" h="30px" r="7px" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skel-row">
                <Bone w="32px" h="32px" r="50%" />
                <div className="skel-row-body">
                  <Bone w={`${40 + (i % 4) * 8}%`} h="13px" />
                  <Bone w="55px" h="22px" r="12px" />
                </div>
                <Bone w="60px" h="28px" r="6px" />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="skel-card skel-card--panel">
        <div className="skel-panel-header">
          <Bone w="180px" h="18px" />
        </div>
        <div className="skel-form-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel-field">
              <Bone w="100px" h="12px" />
              <Bone w="100%" h="40px" r="8px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="page skel-page">
      <div className="skel-topbar">
        <div>
          <Bone w="45%" h="24px" />
          <Bone w="32%" h="13px" />
        </div>
        <Bone w="110px" h="38px" r="8px" />
      </div>

      <div className="skel-card skel-card--panel">
        <div className="skel-panel-header">
          <Bone w="180px" h="18px" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel-row">
            <Bone w="36px" h="36px" r="8px" />
            <div className="skel-row-body">
              <Bone w={`${42 + (i % 4) * 9}%`} h="14px" />
              <Bone w="28%" h="12px" />
            </div>
            <Bone w="64px" h="28px" r="6px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="skel-login-wrap">
      <div className="skel-card skel-login-card">
        <Bone w="64px" h="64px" r="14px" />
        <Bone w="60%" h="22px" />
        <Bone w="80%" h="13px" />
        <div className="skel-field">
          <Bone w="90px" h="13px" />
          <Bone w="100%" h="42px" r="8px" />
        </div>
        <div className="skel-field">
          <Bone w="80px" h="13px" />
          <Bone w="100%" h="42px" r="8px" />
        </div>
        <Bone w="100%" h="44px" r="8px" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  const { pathname } = useLocation();

  if (pathname === "/login") return <LoginSkeleton />;
  if (pathname === "/" ) return <HomeSkeleton />;
  if (pathname.startsWith("/documents")) return <DocumentsSkeleton />;
  if (pathname.startsWith("/safety-6s")) return <SafetySkeleton />;
  if (pathname === "/admin") return <AdminSkeleton />;

  return <GenericSkeleton />;
}
