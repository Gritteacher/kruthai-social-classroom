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
