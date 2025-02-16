"use client";

import { useToast } from "@/lib/use-toast";
import { apiClient } from "@/lib/api";
import { MediaControlPanel } from '@/components/MediaControlPanel';
import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { CustomToolButton, CustomToolGroup } from '@/components/CustomToolButton';
import { Panel } from '@/components/Panel';
import { Providers, useGemini } from '@/components/Providers';
import {
  Move,
  Ruler,
  Pencil,
  Layout,
  Mic,
  Brain,
  Save,
  Share2,
  Settings,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Sun,
  Moon,
  ContrastIcon,
  Crop,
  FileImage,
  Gauge,
  Download,
  LineChart,
  RotateCcw,
  Square,
  ScanLine,
  Stethoscope,
  ArrowLeftRight,
  PlayCircle,
  ZoomIn,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DicomViewer } from '@/components/DicomViewer';
import Image from 'next/image';
import { ImageSeriesUpload } from '@/components/ImageSeriesUpload';
import { processImageSeries, uploadImageSeries, cleanupImageSeries, type ImageSeries } from '@/lib/services/imageUploadService';
import { Toast, Toaster, type ToastProps } from '@/components/ui/toast';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import { 
  initializeCornerstone, 
  loadAndCacheImage
} from '@/lib/utils/cornerstoneInit';

// Viewport types
type ViewportLayout = "1x1" | "2x2" | "3x3";
type ViewportType = "AXIAL" | "SAGITTAL" | "CORONAL";

// Tool types
type Tool =
  | "pan"
  | "zoom"
  | "distance"
  | "area"
  | "angle"
  | "profile"
  | "window"
  | "level"
  | "diagnose"
  | "statistics"
  | "segment"
  | "compare"
  | null;

// type AIModel = "mammogram" | "brain-mri" | "chest-xray";

type AIResult = {
  type: string;
  confidence: number;
  findings: string[];
  segmentation?: string;
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ImageAnalysis {
  description: string;
  findings: string[];
  measurements?: {
    width?: number;
    height?: number;
    aspectRatio?: number;
    density?: number;
  };
  abnormalities?: string[];
}

interface LoadedImage {
  localUrl: string;
  analysis: ImageAnalysis | null | undefined;
  metadata?: {
    modality?: string;
    studyDate?: string;
    seriesNumber?: string;
    instanceNumber?: string;
    dimensions?: {
      width: number;
      height: number;
    };
  };
  imageId: string;
  file?: File;
}

interface ViewportState {
  activeViewport: ViewportType;
  layout: ViewportLayout;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  expandedViewport: ViewportType | null;
  theme: 'light' | 'dark';
  loadedImages?: LoadedImage[];
  currentImageIndex: number;
}

interface ToolbarProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

function LeftToolbar({ isExpanded, onExpandedChange }: ToolbarProps) {
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [toolHistory, setToolHistory] = useState<Tool[]>([]);
  const [window, setWindow] = useState(2000);
  const [level, setLevel] = useState(-498);
  const { toast } = useToast();

  const handleToolClick = (tool: Tool) => {
    if (activeTool === tool && tool) {
      setActiveTool(null);
      setToolHistory((prev) => [...prev.filter(t => t !== tool)]);
    } else if (tool) {
      const prevTool = activeTool;
      setActiveTool(tool);
      setToolHistory((prev) => [...prev.filter(t => t !== tool), tool]);
    }
  };

  return (
    <Panel
      className={cn("h-full flex flex-col shadow-md overflow-hidden relative bg-white dark:bg-[#1b2237]", "border-gray-200 dark:border-[#1b2237]")}
      width={isExpanded ? 320 : 48}
    >
      <div className="flex items-center justify-between h-12 px-4 border-b border-[#e4e7ec] dark:border-[#1b2237]">
        <span className={cn("font-medium truncate text-center w-full", !isExpanded && "opacity-0")}>
          Tools
        </span>
        <button
          className="p-2 hover:bg-[#f4f6f8] dark:hover:bg-[#1b2237] rounded-md text-gray-600 dark:text-foreground/80 hover:text-[#4cedff]"
          onClick={() => onExpandedChange(!isExpanded)}
          aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto transition-all duration-200",
        !isExpanded && "opacity-0"
      )}>
        <div className="space-y-6 p-2">
          <div>
            <h3 className="text-[#64748b] dark:text-foreground/60 text-sm text-center font-semibold mb-4">View</h3>
            <div className="grid grid-cols-4 gap-2">
              <CustomToolButton
                icon={Move}
                label="Pan"
                active={activeTool === "pan"}
                onClick={() => handleToolClick("pan")}
                className="w-full"
              />
              <CustomToolButton
                icon={ZoomIn}
                label="Zoom"
                active={activeTool === "zoom"}
                onClick={() => handleToolClick("zoom")}
                className="w-full"
              />
              <CustomToolButton
                icon={Sun}
                label="Window"
                active={activeTool === "window"}
                onClick={() => handleToolClick("window")}
                className="w-full"
              />
              <CustomToolButton
                icon={ContrastIcon}
                label="Level"
                active={activeTool === "level"}
                onClick={() => handleToolClick("level")}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <h3 className="text-[#64748b] dark:text-foreground/60 text-center text-sm font-semibold mb-4">Measure</h3>
            <div className="grid grid-cols-4 gap-2">
              <CustomToolButton
                icon={Ruler}
                label="Distance"
                active={activeTool === "distance"}
                onClick={() => handleToolClick("distance")}
                className="w-full"
              />
              <CustomToolButton
                icon={Square}
                label="Area"
                active={activeTool === "area"}
                onClick={() => handleToolClick("area")}
                className="w-full"
              />
              <CustomToolButton
                icon={Gauge}
                label="Angle"
                active={activeTool === "angle"}
                onClick={() => handleToolClick("angle")}
                className="w-full"
              />
              <CustomToolButton
                icon={ScanLine}
                label="Profile"
                active={activeTool === "profile"}
                onClick={() => handleToolClick("profile")}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <h3 className="text-[#64748b] dark:text-foreground/60 text-center text-sm font-semibold mb-4">Analyze</h3>
            <div className="grid grid-cols-4 gap-2">
              <CustomToolButton
                icon={Stethoscope}
                label="Diagnose"
                active={activeTool === "diagnose"}
                onClick={() => handleToolClick("diagnose")}
                className="w-full"
              />
              <CustomToolButton
                icon={LineChart}
                label="Statistics"
                active={activeTool === "statistics"}
                onClick={() => handleToolClick("statistics")}
                className="w-full"
              />
              <CustomToolButton
                icon={Crop}
                label="Segment"
                active={activeTool === "segment"}
                onClick={() => handleToolClick("segment")}
                className="w-full"
              />
              <CustomToolButton
                icon={ArrowLeftRight}
                label="Compare"
                active={activeTool === "compare"}
                onClick={() => handleToolClick("compare")}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <h3 className="text-[#64748b] dark:text-foreground/60 text-center text-sm font-semibold mb-4">Tools</h3>
            <div className="grid grid-cols-4 gap-2">
              <CustomToolButton
                icon={Download}
                label="Export"
                onClick={() => {
                  toast({
                    title: "Export",
                    description: "Exporting current view...",
                  });
                }}
                className="w-full"
              />
              <CustomToolButton
                icon={Share2}
                label="Share"
                onClick={() => {
                  toast({
                    title: "Share",
                    description: "Opening share dialog...",
                  });
                }}
                className="w-full"
              />
              <CustomToolButton
                icon={FileImage}
                label="Screenshot"
                onClick={() => {
                  toast({
                    title: "Screenshot",
                    description: "Taking screenshot...",
                  });
                }}
                className="w-full"
              />
              <CustomToolButton
                icon={Settings}
                label="Settings"
                onClick={() => {
                  toast({
                    title: "Settings",
                    description: "Opening settings...",
                  });
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TopToolbar({ 
  theme, 
  onThemeChange, 
  layout,
  onLayoutChange,
  onToggleFullscreen
}: { 
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  layout: ViewportLayout;
  onLayoutChange: (layout: ViewportLayout) => void;
  onToggleFullscreen: () => void;
}) {
  const [selectedView, setSelectedView] = useState<string>("Sagittal");

  const cycleLayout = () => {
    switch (layout) {
      case "1x1":
        onLayoutChange("2x2");
        break;
      case "2x2":
        onLayoutChange("3x3");
        break;
      case "3x3":
        onLayoutChange("1x1");
        break;
    }
  };

  return (
    <div className="h-12 px-4 flex items-center justify-between bg-white dark:bg-[#1b2237] border-b border-[#e2e8f0] dark:border-[#1b2538]">
      <div className="top-header-section">
        <button
          className="tool-button !w-8 !h-8 bg-[#f8fafc] dark:bg-[#161d2f] border-[#e2e8f0] dark:border-[#1b2538]"
          onClick={() => {}}
          aria-label="Reset view"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <select 
          className="bg-[#f8fafc] dark:bg-[#161d2f] text-foreground border-[#e2e8f0] dark:border-[#1b2538] rounded-md px-3 py-1.5"
          value={selectedView}
          onChange={(e) => setSelectedView(e.target.value)}
        >
          <option value="Sagittal">Sagittal</option>
          <option value="Axial">Axial</option>
          <option value="Coronal">Coronal</option>
        </select>
      </div>

      <div className="flex items-center justify-center flex-1">
        <Image
          src={theme === 'dark' ? "/helix-matrix-dark.png" : "/helix-matrix-light.png"}
          alt="GeneSys Logo"
          width={180}
          height={80}
          className="object-contain"
          priority
        />
      </div>

      <div className="top-header-section">
        <button
          className="tool-button !w-8 !h-8 bg-[#f8fafc] dark:bg-[#1b2237] border-[#e2e8f0] dark:border-[#1b2538]"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <button
          className="tool-button !w-8 !h-8 bg-[#f8fafc] dark:bg-[#161d2f] border-[#e2e8f0] dark:border-[#1b2538]"
          onClick={cycleLayout}
          aria-label="Toggle layout"
        >
          <Layout className="h-4 w-4" />
        </button>
        <button
          className="tool-button !w-8 !h-8 bg-[#f8fafc] dark:bg-[#161d2f] border-[#e2e8f0] dark:border-[#1b2538]"
          onClick={onToggleFullscreen}
          aria-label="Toggle fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ViewportGridProps {
  layout: ViewportLayout;
  activeViewport: ViewportType;
  expandedViewport: ViewportType | null;
  onViewportChange: (viewport: ViewportType) => void;
  onViewportExpand: (viewport: ViewportType) => void;
  loadedImages?: LoadedImage[];
  currentImageIndex: number;
}

function ViewportGrid({ 
  layout, 
  activeViewport, 
  expandedViewport,
  onViewportChange,
  onViewportExpand,
  loadedImages,
  currentImageIndex
}: ViewportGridProps) {
  const gridConfig = {
    "1x1": "grid-cols-1",
    "2x2": "grid-cols-2 grid-rows-2",
    "3x3": "grid-cols-3",
  };

  return (
    <div className="p-4 h-full relative bg-[#f8fafc] dark:bg-[#0f131c]">
      <div className={cn(
        "grid gap-4 h-full",
        expandedViewport ? "invisible" : gridConfig[layout]
      )}>
        <ViewportPanel
          type="AXIAL"
          isActive={activeViewport === "AXIAL"}
          isExpanded={expandedViewport === "AXIAL"}
          onActivate={() => onViewportChange("AXIAL")}
          onToggleExpand={() => onViewportExpand("AXIAL")}
          loadedImages={loadedImages}
          currentImageIndex={currentImageIndex}
        />
        {(layout === "2x2" || layout === "3x3") && (
          <>
            <ViewportPanel
              type="SAGITTAL"
              isActive={activeViewport === "SAGITTAL"}
              isExpanded={expandedViewport === "SAGITTAL"}
              onActivate={() => onViewportChange("SAGITTAL")}
              onToggleExpand={() => onViewportExpand("SAGITTAL")}
              loadedImages={loadedImages}
              currentImageIndex={currentImageIndex}
            />
            <ViewportPanel
              type="CORONAL"
              isActive={activeViewport === "CORONAL"}
              isExpanded={expandedViewport === "CORONAL"}
              onActivate={() => onViewportChange("CORONAL")}
              onToggleExpand={() => onViewportExpand("CORONAL")}
              loadedImages={loadedImages}
              currentImageIndex={currentImageIndex}
            />
          </>
        )}
      </div>
      {expandedViewport && (
        <div className="absolute inset-4">
          <ViewportPanel
            type={expandedViewport}
            isActive={true}
            isExpanded={true}
            onActivate={() => {}}
            onToggleExpand={() => onViewportExpand(expandedViewport)}
            loadedImages={loadedImages}
            currentImageIndex={currentImageIndex}
          />
        </div>
      )}
    </div>
  );
}

interface ViewportPanelProps {
  type: ViewportType;
  isActive: boolean;
  isExpanded: boolean;
  onActivate: () => void;
  onToggleExpand: () => void;
  loadedImages?: LoadedImage[];
  currentImageIndex: number;
}

function ViewportPanel({ 
  type, 
  isActive, 
  isExpanded, 
  onActivate, 
  onToggleExpand,
  loadedImages,
  currentImageIndex
}: ViewportPanelProps) {
  const [loadError, setLoadError] = useState<string>();
  //const { loadedImages, currentImageIndex } = viewportState;

  const currentImageId = useMemo(() => {
    if (!loadedImages || loadedImages.length === 0) return undefined;
    return loadedImages[currentImageIndex]?.imageId;
  }, [loadedImages, currentImageIndex]);

  const handleImageLoaded = useCallback((success: boolean) => {
    if (!success) {
      setLoadError('Failed to load image');
    } else {
      setLoadError(undefined);
    }
  }, []);

  return (
    <div 
      className={cn(
        "relative w-full h-full min-h-0 rounded-lg overflow-hidden",
        "border transition-all duration-200",
        "bg-[#0a0d13]",
        "border-[#1b2538]",
        "shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]",
        isActive && "border-[#4cedff] ring-1 ring-[#4cedff] shadow-[0_0_30px_rgba(76,237,255,0.2)]",
        isExpanded && "absolute inset-4 m-0 z-30 shadow-[0_0_40px_rgba(76,237,255,0.25)]"
      )}
      onClick={onActivate}
    >
      <DicomViewer
        imageId={currentImageId}
        viewportType={type}
        isActive={isActive}
        isExpanded={isExpanded}
        onActivate={onActivate}
        onToggleExpand={onToggleExpand}
        onImageLoaded={handleImageLoaded}
      />
      <div className="absolute top-2 left-2 px-2 py-1 text-xs font-medium rounded bg-[#161d2f]/80 text-foreground/80 backdrop-blur-sm">
        {type}
      </div>
      {loadError && (
        <div className="absolute bottom-2 left-2 px-2 py-1 text-xs font-medium rounded bg-red-500/80 text-white backdrop-blur-sm">
          {loadError}
        </div>
      )}
      <button
        className="absolute top-2 right-2 p-1.5 rounded-md bg-[#161d2f]/80 hover:bg-[#1f2642] text-foreground/80 hover:text-[#4cedff] transition-colors shadow-md backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function RightPanel({ isExpanded, onExpandedChange, viewportState, setViewportState }: ToolbarProps & { viewportState: ViewportState, setViewportState: React.Dispatch<React.SetStateAction<ViewportState>> }): JSX.Element {
  const [selectedTab, setSelectedTab] = useState<string>("analysis");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEventLogDetached, setIsEventLogDetached] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isConnected, sendTextMessage, error } = useGemini();
  const { toast } = useToast();
  const [currentSeries, setCurrentSeries] = useState<ImageSeries | null>(null);
  const [toasts, setToasts] = useState<Omit<ToastProps, 'onDismiss'>[]>([]);

  // Cleanup function for when component unmounts or series changes
  useEffect(() => {
    return () => {
      if (currentSeries) {
        cleanupImageSeries(currentSeries);
      }
    };
  }, [currentSeries]);

  const showToast = useCallback(({ title, description, variant = 'default' }: Omit<ToastProps, 'id' | 'onDismiss'>) => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, title, description, variant }]);
  }, []);

  const handleLoadSeries = useCallback(async () => {
    if (!currentSeries) return;

    try {
      // Clean up any existing blob URLs
      if (viewportState.loadedImages) {
        viewportState.loadedImages.forEach(image => {
          if (image.imageId.startsWith('blob:')) {
            URL.revokeObjectURL(image.imageId);
          } else if (image.imageId.startsWith('dicomfile://blob:')) {
            URL.revokeObjectURL(image.imageId.replace('dicomfile://', ''));
          }
        });
      }

      const newLoadedImages = await Promise.all(
        currentSeries.images.map(async (image) => {
          let imageId;
          
          // Create a blob URL for the file
          const blob = new Blob([image.file], { type: image.file.type });
          const blobUrl = URL.createObjectURL(blob);
          
          if (image.format === 'dicom') {
            // For DICOM files, use the dicomfile loader
            imageId = `dicomfile://${blobUrl}`;
          } else {
            // For other image types, use the regular URL
            imageId = blobUrl;
          }

          return {
            localUrl: image.localUrl,
            analysis: image.analysis,
            metadata: image.metadata,
            imageId,
            file: image.file
          };
        })
      );

      setViewportState((prev) => ({
        ...prev,
        loadedImages: newLoadedImages,
        currentImageIndex: 0
      }));

      showToast({
        title: 'Series Loaded',
        description: `Successfully loaded ${newLoadedImages.length} images into viewers`
      });

    } catch (err) {
      console.error('Error loading series:', err);
      showToast({
        title: 'Error',
        description: 'Failed to load image series. Please ensure files are valid DICOM images.',
        variant: 'destructive'
      });
    }
  }, [currentSeries, showToast, viewportState.loadedImages]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      if (viewportState.loadedImages) {
        viewportState.loadedImages.forEach(image => {
          if (image.imageId.startsWith('blob:')) {
            URL.revokeObjectURL(image.imageId);
          } else if (image.imageId.startsWith('dicomfile://blob:')) {
            URL.revokeObjectURL(image.imageId.replace('dicomfile://', ''));
          }
        });
      }
    };
  }, []);

  const handleSendMessage = useCallback(async (command: any) => {
    if (!message.trim()) return;
    
    const currentMessage = message;
    setMessage("");
    
    try {
      setMessages(prev => [...prev, { role: 'user', content: currentMessage }]);
      await sendTextMessage(JSON.stringify({ type: 'message', payload: { text: currentMessage } }));
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to send message' }]);
    }
  }, [message, sendTextMessage]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const handleUploadComplete = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) {
      showToast({
        title: 'Upload Failed',
        description: 'No files provided.',
        variant: 'destructive'
      });
      return;
    }

    try {
      if (currentSeries) {
        cleanupImageSeries(currentSeries);
      }

      const series = await processImageSeries(files);
      setCurrentSeries(series);

      showToast({
        title: 'Upload Successful',
        description: `Loaded ${series.images.length} images into ${series.viewerType} viewer`
      });
    } catch (error) {
      console.error('Upload error:', error);
      showToast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to process images',
        variant: 'destructive'
      });
    }
  }, [currentSeries, showToast]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage({ type: 'loadSeries', payload: { seriesId: currentSeries?.id, format: currentSeries?.format, viewerType: currentSeries?.viewerType, metadata: currentSeries?.metadata, images: currentSeries?.images.map(img => ({ url: img.localUrl, analysis: img.analysis, metadata: img.metadata })) } });
    }
  }, [handleSendMessage, currentSeries]);

  return (
    <>
      <div className={cn("h-full flex flex-col shadow-md overflow-hidden relative bg-white dark:bg-[#1b2237]", "border-gray-200 dark:border-[#1b2237]")}>
      <div className="flex items-center justify-between h-12 px-4 border-b border-[#e4e7ec] dark:border-[#1b2237]">
          <button
            className={cn(
              "p-2 rounded-md",
              "hover:bg-gray-100 dark:hover:bg-[#2D3848]",
              "text-gray-600 dark:text-foreground/80",
              "hover:text-gray-900 dark:hover:text-[#1b2237]"
            )}
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <span className={cn("font-medium flex-1 text-center", !isExpanded && "opacity-0")}>
            Analysis
          </span>
        </div>
        <div className={cn("px-4 py-2 border-b border-[#2D3848]", "dark:border-[#1b2237]")}>
          {currentSeries && (
            <button
              onClick={handleLoadSeries}
              type="button"
              className={cn(
                "w-full px-4 py-2 rounded-md transition-colors duration-200",
                "focus:outline-none focus:ring-2 focus:ring-[#4cedff] focus:ring-offset-2",
                "focus:ring-offset-white dark:focus:ring-offset-[#1b2538]",
                "bg-gray-100 dark:bg-[#2D3848]",
                "text-gray-900 dark:text-[#4cedff]",
                "hover:bg-gray-200 dark:hover:bg-[#1b2237]",
                "flex items-center justify-center gap-2"
              )}
            >
              <FileImage className="h-4 w-4" />
              Load Series
            </button>
          )}
        </div>
        <div className={cn(
          "flex-1 overflow-hidden",
          !isExpanded && "hidden"
        )}>
          <div className="h-full p-4">
            <Tabs defaultValue="analysis">
              <TabsList className="grid w-full grid-cols-2 gap-1 p-1 rounded-md">
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                {/* <TabsTrigger value="voice">Voice</TabsTrigger> */}
                <TabsTrigger value="events">Events</TabsTrigger>
              </TabsList>

              <TabsContent value="analysis" className="mt-4">
                <div className="space-y-4">
                  <ImageSeriesUpload onUploadComplete={handleUploadComplete} />
                  <div className={cn(
                    "flex flex-col h-[300px] rounded-md",
                    "bg-gray-50 dark:bg-[#161d2f] hover:bg-gray-50"
                  )}>
                    <div className={cn(
                      "flex items-center justify-between p-2 border-b",
                      "border-gray-200 dark:border-[#64447]"
                    )}>
                      <span className="text-sm font-medium">Chat</span>
                      <button
                        onClick={() => setIsChatExpanded(!isChatExpanded)}
                        className={cn(
                          "p-1.5 rounded-md",
                          "hover:bg-gray-100 dark:hover:bg-[#64447]",
                          "text-gray-600 dark:text-foreground/80",
                          "hover:text-gray-900 dark:hover:text-[#4cedff]"
                        )}
                        title={isChatExpanded ? "Minimize chat" : "Expand chat"}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 bg-[#161d2f] overflow-y-auto p-4">
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={cn(
                            "p-2 rounded-lg max-w-[80%] mb-2",
                            msg.role === 'user' 
                              ? "bg-blue-500 dark:bg-[#1b2237] text-white dark:text-[#1b2237] ml-auto" 
                              : "bg-gray-100 dark:bg-[#2D3848] text-gray-900 dark:text-foreground/80"
                          )}
                        >
                          {msg.content}
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <div className={cn(
                      "flex gap-2 p-2 border-t",
                      "border-gray-200 dark:border-[#2D3848]"
                    )}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={message}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className={cn(
                          "min-w-0 flex-1 px-3 py-2 rounded-md",
                          "bg-white dark:bg-[#2D3848]",
                          "border-gray-300 dark:border-[#4D5867]",
                          "text-gray-900 dark:text-foreground",
                          "focus:outline-none focus:ring-2 focus:ring-[#4cedff] dark:focus:ring-[#4cedff]",
                          "focus:border-transparent"
                        )}
                        autoComplete="off"
                      />
                      <button
                        onClick={() => handleSendMessage({ type: 'message', payload: { text: message } })}
                        type="button"
                        disabled={!message.trim()}
                        className={cn(
                          "shrink-0 px-4 py-2 rounded-md transition-colors duration-200",
                          "focus:outline-none focus:ring-2",
                          "focus:ring-blue-500 dark:focus:ring-[#4cedff]",
                          "focus:ring-offset-2",
                          "focus:ring-offset-white dark:focus:ring-offset-[#1b2237]",
                          message.trim()
                            ? "bg-[#4cedff] dark:bg-[#4cedff] text-white dark:text-[#1b2237] hover:bg-blue-600 dark:hover:bg-[#4cedff]/90"
                            : "bg-gray-100 dark:bg-[#2D3848] text-gray-400 dark:text-foreground/50 cursor-not-allowed"
                        )}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="voice" className="mt-4">
                {/* Voice content */}
              </TabsContent>

              <TabsContent value="events" className="mt-4">
                <div className={cn(
                  "flex flex-col h-[300px] rounded-md",
                  "bg-gray-50 dark:bg-[#1b2237]"
                )}>
                  <div className={cn(
                    "flex items-center justify-between p-2 border-b",
                    "border-gray-200 dark:border-[#2D3848]"
                  )}>
                    <span className="text-sm font-medium">Event Log</span>
                    <button
                      onClick={() => setIsEventLogDetached(!isEventLogDetached)}
                      className={cn(
                        "p-1.5 rounded-md",
                        "hover:bg-gray-100 dark:hover:bg-[#2D3848]",
                        "text-gray-600 dark:text-foreground/80",
                        "hover:text-gray-900 dark:hover:text-[#4cedff]"
                      )}
                    >
                      {isEventLogDetached ? "Attach" : "Detach"}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {/* Event log content */}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Expanded Chat Modal */}
      {isChatExpanded && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center">
          <div className="bg-[#1b2237] rounded-lg shadow-lg border border-[#2D3848] p-4 w-[800px] h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">AI Chat</span>
              <button
                onClick={() => setIsChatExpanded(false)}
                className="p-1.5 rounded-md hover:bg-[#2D3848] text-foreground/80 hover:text-[#4cedff]"
                title="Close expanded chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 bg-[#161d2f] rounded-md p-4 overflow-y-auto">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-3 rounded-lg max-w-[80%] mb-3",
                    msg.role === 'user' 
                      ? "bg-[#4cedff] text-[#1b2237] ml-auto" 
                      : "bg-[#2D3848] text-foreground/80"
                  )}
                >
                  {msg.content}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-4">
              <div className="flex gap-2 p-2 border-t border-[#2D3848]">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="min-w-0 flex-1 px-3 py-2 bg-[#2D3848] border border-[#4D5867] rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-[#4cedff] focus:border-transparent"
                  autoComplete="off"
                />
                <button
                  onClick={() => handleSendMessage({ type: 'message', payload: { text: message } })}
                  type="button"
                  disabled={!message.trim()}
                  className={cn(
                    "shrink-0 px-4 py-2 rounded-md transition-colors duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-[#4cedff] focus:ring-offset-2 focus:ring-offset-[#1b2237]",
                    message.trim() 
                      ? "bg-[#4cedff] text-[#1b2237] hover:bg-[#4cedff]/90" 
                      : "bg-[#2D3848] text-foreground/50 cursor-not-allowed"
                  )}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetachedEventLog({ onAttach }: { onAttach: () => void }) {
  return (
    <div className="fixed bottom-32 right-8 w-80 z-50 bg-[#1b2237] rounded-md shadow-lg border border-[#2D3848]">
      <div className="flex items-center justify-between p-2 border-b border-[#2D3848]">
        <span className="text-sm font-medium">Event Log</span>
        <button
          onClick={onAttach}
          className="p-1.5 rounded-md hover:bg-[#2D3848] text-foreground/80 hover:text-[#4cedff]"
        >
          Attach
        </button>
      </div>
      <div className="h-[300px] overflow-y-auto p-4">
        {/* Event log content */}
      </div>
    </div>
  );
}

function App() {
  const [showMediaControls, setShowMediaControls] = useState(true);
  const [isEventLogDetached, setIsEventLogDetached] = useState(false);
  const [viewportState, setViewportState] = useState<ViewportState>({
    activeViewport: "AXIAL",
    layout: "2x2",
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    expandedViewport: null,
    theme: "dark",
    currentImageIndex: 0,
    loadedImages: []
  });

  const { 
    activeViewport, 
    layout, 
    leftPanelCollapsed,
    rightPanelCollapsed,
    expandedViewport,
    theme
  } = viewportState;

  const DEFAULT_PANEL_WIDTH = 320;
  const COLLAPSED_PANEL_WIDTH = 48;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setViewportState(prev => ({
      ...prev,
      theme: newTheme
    }));
  };

  const handleLayoutChange = (newLayout: ViewportLayout) => {
    setViewportState(prev => ({
      ...prev,
      layout: newLayout,
      expandedViewport: null // Reset expanded state when changing layout
    }));
  };

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleViewportExpand = (viewport: ViewportType) => {
    setViewportState(prev => ({
      ...prev,
      expandedViewport: prev.expandedViewport === viewport ? null : viewport
    }));
  };

  // Initialize cornerstone WADO image loader
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.configure({
    beforeSend: (xhr: XMLHttpRequest) => {
      // Add any headers or configurations needed for your WADO server
    }
  });

  // Initialize cornerstone when the app starts
  if (typeof window !== 'undefined') {
    initializeCornerstone();
  }

  return (
    <div className="medical-viewer w-screen h-screen overflow-hidden">
      <MediaControlPanel />
      {isEventLogDetached && (
        <DetachedEventLog onAttach={() => setIsEventLogDetached(false)} />
      )}
      {/* Left Panel */}
      <Panel
        className="fixed top-0 bottom-0 left-0 bg-card border-r border-border z-40"
        width={leftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : DEFAULT_PANEL_WIDTH}
      >
        <LeftToolbar
          isExpanded={!leftPanelCollapsed}
          onExpandedChange={(expanded) => 
            setViewportState(prev => ({ ...prev, leftPanelCollapsed: !expanded }))
          }
        />
      </Panel>

      {/* Main Content */}
      <div
        className="fixed top-0 bottom-0 transition-all duration-200"
        style={{
          left: `${leftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : DEFAULT_PANEL_WIDTH}px`,
          right: `${rightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : DEFAULT_PANEL_WIDTH}px`,
        }}
      >
        <TopToolbar 
          theme={theme}
          onThemeChange={handleThemeChange}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          onToggleFullscreen={handleFullscreenToggle}
        />
        <div className="h-[calc(100vh-3rem)] w-full">
          <ViewportGrid 
            layout={layout}
            activeViewport={activeViewport}
            expandedViewport={expandedViewport}
            onViewportChange={(viewport) => 
              setViewportState(prev => ({ ...prev, activeViewport: viewport }))
            }
            onViewportExpand={handleViewportExpand}
            loadedImages={viewportState.loadedImages}
            currentImageIndex={viewportState.currentImageIndex}
          />
        </div>
      </div>

      {/* Right Panel */}
      <div 
        className="fixed top-0 bottom-0 right-0 z-40 bg-[#1b2237] shadow-lg"
        style={{
          width: rightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : DEFAULT_PANEL_WIDTH
        }}
      >
        <RightPanel
          isExpanded={!rightPanelCollapsed}
          onExpandedChange={(expanded) => 
            setViewportState(prev => ({ ...prev, rightPanelCollapsed: !expanded }))
          }
          viewportState={viewportState}
          setViewportState={setViewportState}
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Providers>
      <App />
    </Providers>
  );
}
