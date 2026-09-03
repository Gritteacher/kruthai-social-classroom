import { useEffect, useRef, useState } from "react";
import {
  convertToExcalidrawElements,
  Excalidraw,
  restoreElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type {
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { WorksheetAnnotation, WorksheetCrop } from "./types";

const BACKGROUND_ELEMENT_ID = "worksheet-pdf-background";

type PageImage = {
  dataUrl: string;
  width: number;
  height: number;
};

type ExcalidrawWorksheetCanvasProps = {
  image: PageImage;
  annotations: WorksheetAnnotation[];
  crop: WorksheetCrop;
  readOnly: boolean;
  sceneKey: string;
  onChange: (annotations: WorksheetAnnotation[]) => void;
};

export function ExcalidrawWorksheetCanvas({
  image,
  annotations,
  crop,
  readOnly,
  sceneKey,
  onChange,
}: ExcalidrawWorksheetCanvasProps) {
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);
  const hasInteractedRef = useRef(false);
  const lastSceneRef = useRef("");
  const preparedRef = useRef<ReturnType<typeof prepareScene> | null>(null);
  if (!preparedRef.current) {
    preparedRef.current = prepareScene(sceneKey, image, annotations, crop);
  }
  const prepared = preparedRef.current;

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  function connectApi(api: ExcalidrawImperativeAPI) {
    window.setTimeout(() => {
      const page = api
        .getSceneElements()
        .find((element) => element.id === BACKGROUND_ELEMENT_ID);
      if (page) {
        api.scrollToContent(page, {
          fitToViewport: true,
          viewportZoomFactor: 0.88,
          animate: false,
        });
      }
      if (!readOnly) api.setActiveTool({ type: "freedraw" });
    }, 120);
  }

  function handleChange(elements: readonly OrderedExcalidrawElement[]) {
    if (readOnly) return;
    const studentElements = elements
      .filter(
        (element) =>
          element.id !== BACKGROUND_ELEMENT_ID &&
          !element.isDeleted &&
          element.customData?.worksheetBackground !== true,
      )
      .map((element) => JSON.parse(JSON.stringify(element)) as WorksheetAnnotation);
    const serialized = JSON.stringify(studentElements);
    if (!hasInteractedRef.current || serialized === lastSceneRef.current) {
      lastSceneRef.current = serialized;
      return;
    }
    lastSceneRef.current = serialized;
    onChange(studentElements);
  }

  return (
    <div className="worksheet-excalidraw" data-scene={sceneKey}>
      <Excalidraw
        initialData={prepared.initialData}
        excalidrawAPI={connectApi}
        onChange={handleChange}
        onPointerDown={() => {
          hasInteractedRef.current = true;
        }}
        viewModeEnabled={readOnly}
        zenModeEnabled={false}
        theme={theme}
        langCode="th-TH"
        autoFocus={!readOnly}
        handleKeyboardGlobally={false}
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
      />
    </div>
  );
}

function prepareScene(
  sceneKey: string,
  image: PageImage,
  annotations: WorksheetAnnotation[],
  crop: WorksheetCrop,
) {
  const fileId = `worksheet-page-${sceneKey}` as FileId;
  const file: BinaryFileData = {
    id: fileId,
    mimeType: "image/png",
    dataURL: image.dataUrl as DataURL,
    created: Date.now(),
  };
  const background = convertToExcalidrawElements(
    [
      {
        type: "image",
        id: BACKGROUND_ELEMENT_ID,
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
        fileId,
        status: "saved",
        scale: [1, 1],
        crop: null,
        locked: true,
        roughness: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        customData: { worksheetBackground: true },
      },
    ] as never,
    { regenerateIds: false },
  );
  const userElements = restoreOrMigrateAnnotations(
    annotations,
    image.width,
    image.height,
    crop,
  );
  const elements = restoreElements(
    [...background, ...userElements] as never,
    null,
    { refreshDimensions: true },
  );
  const files: BinaryFiles = { [fileId]: file };
  const initialData: ExcalidrawInitialDataState = {
    elements,
    files,
    appState: {
      viewBackgroundColor: "#eef0f3",
      currentItemStrokeColor: "#1d1d1f",
      currentItemStrokeWidth: 2,
      currentItemRoughness: 0,
      activeTool: {
        type: "freedraw",
        customType: null,
        locked: false,
        lastActiveTool: null,
      },
    },
  };
  return { initialData };
}

function restoreOrMigrateAnnotations(
  annotations: WorksheetAnnotation[],
  width: number,
  height: number,
  crop: WorksheetCrop,
) {
  const excalidrawElements = annotations.filter(isExcalidrawElement);
  const restored = restoreElements(excalidrawElements as never, null, {
    refreshDimensions: true,
  });
  const legacySkeletons: Record<string, unknown>[] = [];

  for (const annotation of annotations) {
    if (annotation.kind === "stroke" && Array.isArray(annotation.points)) {
      const sourcePoints = annotation.points.filter(
        (value): value is number => typeof value === "number",
      );
      if (sourcePoints.length < 2) continue;
      const absolute: [number, number][] = [];
      for (let index = 0; index < sourcePoints.length; index += 2) {
        absolute.push([
          ((sourcePoints[index] - crop.x) / crop.width) * width,
          ((sourcePoints[index + 1] - crop.y) / crop.height) * height,
        ]);
      }
      const [originX, originY] = absolute[0];
      legacySkeletons.push({
        type: "line",
        id: annotation.id,
        x: originX,
        y: originY,
        points: absolute.map(([x, y]) => [x - originX, y - originY]),
        strokeColor: annotation.color || "#1d1d1f",
        strokeWidth: annotation.width || 2,
        roughness: 0,
      });
    } else if (annotation.kind === "text" && typeof annotation.text === "string") {
      legacySkeletons.push({
        type: "text",
        id: annotation.id,
        x: ((Number(annotation.x) - crop.x) / crop.width) * width,
        y: ((Number(annotation.y) - crop.y) / crop.height) * height,
        text: annotation.text,
        strokeColor: annotation.color || "#1d1d1f",
        fontSize: Number(annotation.fontSize) || 20,
      });
    }
  }

  if (!legacySkeletons.length) return restored;
  const migrated = convertToExcalidrawElements(legacySkeletons as never, {
    regenerateIds: false,
  });
  return [...restored, ...migrated];
}

function isExcalidrawElement(annotation: WorksheetAnnotation) {
  return (
    "type" in annotation &&
    typeof annotation.type === "string" &&
    typeof annotation.id === "string" &&
    annotation.kind !== "stroke" &&
    annotation.kind !== "text"
  );
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export async function renderWorksheetPageForAi(
  image: PageImage,
  annotations: WorksheetAnnotation[],
  crop: WorksheetCrop,
  sceneKey: string,
) {
  const prepared = prepareScene(sceneKey, image, annotations, crop);
  const elements = (prepared.initialData.elements || []).filter(
    (element) => element.id !== BACKGROUND_ELEMENT_ID && !element.isDeleted,
  );
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("อุปกรณ์นี้ไม่สามารถเตรียมภาพสำหรับ AI ได้");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(await loadImage(image.dataUrl), 0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  for (const element of elements) drawAiElement(context, element as unknown as Record<string, unknown>);
  context.restore();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("สร้างภาพสำหรับ AI ไม่สำเร็จ"))),
      "image/jpeg",
      0.84,
    );
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("โหลดภาพใบงานสำหรับ AI ไม่สำเร็จ"));
    image.src = source;
  });
}

function drawAiElement(context: CanvasRenderingContext2D, element: Record<string, unknown>) {
  const type = String(element.type || "");
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const width = Number(element.width) || 0;
  const height = Number(element.height) || 0;
  const stroke = String(element.strokeColor || "#1d1d1f");
  const fill = String(element.backgroundColor || "transparent");
  const angle = Number(element.angle) || 0;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, (Number(element.opacity) || 100) / 100));
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.translate(-width / 2, -height / 2);
  context.strokeStyle = stroke;
  context.fillStyle = fill === "transparent" ? "rgba(0,0,0,0)" : fill;
  context.lineWidth = Math.max(1, Number(element.strokeWidth) || 2);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (type === "text") {
    const fontSize = Math.max(8, Number(element.fontSize) || 20);
    context.fillStyle = stroke;
    context.font = `${fontSize}px Prompt, sans-serif`;
    context.textBaseline = "top";
    String(element.text || "")
      .split("\n")
      .forEach((line, index) => context.fillText(line, 0, index * fontSize * 1.25));
  } else if (type === "ellipse") {
    context.beginPath();
    context.ellipse(width / 2, height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
    if (fill !== "transparent") context.fill();
    context.stroke();
  } else if (type === "diamond") {
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width, height / 2);
    context.lineTo(width / 2, height);
    context.lineTo(0, height / 2);
    context.closePath();
    if (fill !== "transparent") context.fill();
    context.stroke();
  } else if (type === "rectangle") {
    if (fill !== "transparent") context.fillRect(0, 0, width, height);
    context.strokeRect(0, 0, width, height);
  } else if (type === "freedraw" || type === "line" || type === "arrow") {
    const points = Array.isArray(element.points) ? element.points : [];
    context.beginPath();
    points.forEach((point, index) => {
      if (!Array.isArray(point)) return;
      const pointX = Number(point[0]) || 0;
      const pointY = Number(point[1]) || 0;
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    });
    context.stroke();
  }
  context.restore();
}
