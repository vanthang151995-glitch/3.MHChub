// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import OfficeFileViewer from "./OfficeFileViewer";

const SUPPORTED_EXTS = new Set([
  "xlsx","xls","docx","pdf",
  "png","jpg","jpeg","gif","webp","svg"
]);

function getExt(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

function isSupported(file: File) {
  return SUPPORTED_EXTS.has(getExt(file.name));
}

function fileIcon(name: string) {
  const ext = getExt(name);
  if (ext === "pdf") return "📕";
  if (ext === "docx") return "📘";
  if (["xlsx","xls"].includes(ext)) return "📗";
  if (["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return "🖼️";
  return "📄";
}

export function GlobalDropZone() {
  const [dragging, setDragging] = useState(false);
  const [dragSupported, setDragSupported] = useState(false);
  const [viewerFile, setViewerFile] = useState<File | null>(null);
  const counter = useRef(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    const hasSupported = Array.from(e.dataTransfer.items || []).some(
      item => item.kind === "file"
    );
    counter.current++;
    if (counter.current === 1) {
      setDragging(true);
      setDragSupported(hasSupported);
    }
  }, []);

  const onDragLeave = useCallback(() => {
    counter.current = Math.max(0, counter.current - 1);
    if (counter.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    counter.current = 0;
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && isSupported(file)) {
      setViewerFile(file);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [onDragEnter, onDragLeave, onDragOver, onDrop]);

  return (
    <>
      {dragging && (
        <div style={{
          position:"fixed", inset:0, zIndex:8888,
          pointerEvents:"none",
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(15,23,42,0.55)",
          backdropFilter:"blur(4px)",
          animation:"gdz-in 0.15s ease-out"
        }}>
          <style>{`
            @keyframes gdz-in{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}
            @keyframes gdz-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
          `}</style>
          <div style={{
            background:"#fff", borderRadius:20,
            border:"3px dashed #217346",
            padding:"48px 64px",
            display:"flex", flexDirection:"column",
            alignItems:"center", gap:16,
            boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
            animation:"gdz-pulse 1.5s ease-in-out infinite"
          }}>
            <div style={{ fontSize:52 }}>📂</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#0f172a" }}>
              Thả file để xem ngay
            </div>
            <div style={{ fontSize:13, color:"#64748b", textAlign:"center", lineHeight:1.6 }}>
              Excel · Word · PDF · Ảnh<br/>
              <span style={{ fontSize:11, color:"#94a3b8" }}>Không cần upload — xem trực tiếp</span>
            </div>
            <div style={{
              display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center", marginTop:4
            }}>
              {["📗 Excel","📘 Word","📕 PDF","🖼️ Ảnh"].map(t => (
                <span key={t} style={{
                  fontSize:11, fontWeight:700,
                  padding:"3px 10px", borderRadius:20,
                  background:"#f0fdf4", color:"#15803d",
                  border:"1px solid #bbf7d0"
                }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewerFile && (
        <OfficeFileViewer
          fileName={viewerFile.name}
          fileObj={viewerFile}
          onClose={() => setViewerFile(null)}
        />
      )}
    </>
  );
}
