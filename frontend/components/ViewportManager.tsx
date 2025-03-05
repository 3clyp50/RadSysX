"use client";

import * as React from 'react';
import { useState, lazy, Suspense, useEffect } from 'react';
import { LoadedImage } from '@/lib/types';
import { Toggle, type ToggleProps } from '@/components/ui/Toggle';
import { Box, ImageIcon, Loader2, AlertTriangle, Info } from 'lucide-react';
import { UiToolType } from '@/lib/utils/cornerstone3DInit';
import { canLoadAsVolume } from '@/lib/utils/cornerstone3DInit';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// Dynamically import DicomViewer3D with no SSR
const DicomViewer3D = dynamic(
  () => import('./DicomViewer3D').then(mod => ({ default: mod.DicomViewer3D })),
  { ssr: false }
);

// Dynamically import ViewportManager3D with no SSR
const ViewportManager3D = dynamic(
  () => import('./ViewportManager3D').then(mod => ({ default: mod.ViewportManager3D })),
  { ssr: false }
);

// Error boundary fallback component for AdvancedViewer
function AdvancedViewerFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 p-6 max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-2" />
        <h3 className="text-lg font-semibold">3D Viewer Error</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          The 3D viewer could not be loaded. This may be due to browser compatibility issues or missing modules.
        </p>
        <button 
          onClick={onReset}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          Switch to 2D View
        </button>
      </div>
    </div>
  );
}

// Component to display message for 2D images in non-axial views
function TwoDimensionalImageMessage() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
      <div className="flex flex-col items-center p-4 max-w-[80%] text-center">
        <Info className="h-8 w-8 text-[#4cedff] mb-2" />
        <p className="font-medium">2D Image - View In Axial Plane</p>
        <p className="text-sm mt-2">This 2D image can only be viewed in the axial plane. Click the expand button in the axial view for a larger display.</p>
      </div>
    </div>
  );
}

// Dynamically import the AdvancedViewer to avoid server-side import issues
const AdvancedViewer = lazy(() => 
  import('./AdvancedViewer')
    .then(mod => ({ default: mod.AdvancedViewer }))
    .catch(err => {
      console.error('Failed to load AdvancedViewer:', err);
      // Return a dummy component on error that will trigger the error handler
      return { 
        default: ({ localFiles, onError }: { localFiles?: File[], onError?: () => void }) => {
          // Call the error handler after render if provided
          useEffect(() => {
            if (onError) onError();
          }, [onError]);
          
          return <AdvancedViewerFallback onReset={() => {}} />;
        }
      };
    })
);

// Add Tool type that matches the one in AdvancedViewer
type Tool = UiToolType;

interface ViewportManagerProps {
  loadedImages?: LoadedImage[];
  currentImageIndex: number;
  onActivate?: () => void;
  onToggleExpand?: () => void;
  isActive?: boolean;
  isExpanded?: boolean;
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  activeTool?: Tool;
}

// Add type for dynamic components
interface DynamicDicomViewer3DProps {
  imageId?: string;
  imageIds?: string[];
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D' | 'SERIES';
  isActive?: boolean;
  isExpanded?: boolean;
  onActivate?: () => void;
  onToggleExpand?: () => void;
  onImageLoaded?: (success: boolean, is2DImage: boolean) => void;
  activeTool?: UiToolType;
  suppressErrors?: boolean;
  hideExpandButton?: boolean;
}

interface DynamicViewportManager3DProps {
  imageIds: string[];
  viewportType: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  activeTool?: UiToolType;
  showTools: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
  onImageLoaded?: (success: boolean, is2D?: boolean) => void;
}

// Type assertions for dynamic components
const TypedDicomViewer3D = DicomViewer3D as React.ComponentType<DynamicDicomViewer3DProps>;
const TypedViewportManager3D = ViewportManager3D as React.ComponentType<DynamicViewportManager3DProps>;

export function ViewportManager({
  loadedImages,
  currentImageIndex,
  onActivate,
  onToggleExpand,
  isActive,
  isExpanded,
  viewportType,
  activeTool
}: ViewportManagerProps) {
  const [useAdvancedViewer, setUseAdvancedViewer] = useState(false);
  const [imageLoadSuccess, setImageLoadSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advancedViewerError, setAdvancedViewerError] = useState(false);
  const [is2DImage, setIs2D] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Use useEffect to detect client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get the current image details
  const currentImage = loadedImages?.[currentImageIndex];
  const allImageIds = loadedImages?.map(img => img.imageId) || [];
  
  // Function to determine if an image is 2D based on file format and count
  const is2DImageFormat = (images?: LoadedImage[]) => {
    if (!images || images.length === 0) return false;
    
    // Single image is always treated as 2D
    if (images.length === 1) {
      console.log('ViewportManager: Single image detected, treating as 2D');
      return true;
    }
    
    // Check if it's a standard 2D image format
    const firstImage = images[0];
    const fileName = firstImage.file.name.toLowerCase();
    const is2DFormat = fileName.endsWith('.png') || 
                      fileName.endsWith('.jpg') || 
                      fileName.endsWith('.jpeg') || 
                      fileName.endsWith('.gif') || 
                      fileName.endsWith('.bmp') ||
                      firstImage.format === 'png' ||
                      firstImage.format === 'jpg' ||
                      firstImage.format === 'jpeg';
                      
    return is2DFormat;
  };

  // Effect to check image type when images change
  useEffect(() => {
    const checkImageType = async () => {
      if (!loadedImages || loadedImages.length === 0) {
        setIs2D(false);
        setUseAdvancedViewer(false);
        return;
      }

      try {
        // First check if we have a single image or 2D format
        const is2D = is2DImageFormat(loadedImages);
        console.log('ViewportManager: Image type check:', { is2D, imageCount: loadedImages.length });

        if (is2D) {
          setIs2D(true);
          setUseAdvancedViewer(false);
          return;
        }

        // For multiple DICOM images, check if they can form a volume
        if (loadedImages.length > 1) {
          const canLoadVolume = await canLoadAsVolume(allImageIds);
          console.log('ViewportManager: Volume check result:', canLoadVolume);
          setUseAdvancedViewer(canLoadVolume);
          setIs2D(!canLoadVolume);
        }
      } catch (error) {
        console.error('ViewportManager: Error checking image type:', error);
        // On error, default to 2D viewing
        setIs2D(true);
        setUseAdvancedViewer(false);
      }
    };

    checkImageType();
  }, [loadedImages, allImageIds]);

  const handleImageLoaded = (success: boolean) => {
    setImageLoadSuccess(success);
    
    // Don't show errors if no images are loaded yet
    if (!loadedImages || loadedImages.length === 0) {
      setLoadError(null);
      return;
    }
    
    if (!success) {
      setLoadError('Failed to load image');
    } else {
      setLoadError(null);
    }
  };

  const handleAdvancedViewerError = () => {
    console.error('Advanced viewer error occurred - falling back to 2D viewer');
    setAdvancedViewerError(true);
    setUseAdvancedViewer(false);
    setLoadError('3D Viewer initialization failed. Switched to 2D viewer.');
    
    setTimeout(() => {
      setLoadError(null);
    }, 5000);
  };

  const isDisabled = !loadedImages?.length;
  const shouldSuppressErrors = is2DImage && viewportType !== 'AXIAL' && !useAdvancedViewer;

  // Modify the return statement to only render when on client side
  if (!isClient) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-t-transparent border-[#4cedff] rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Only show toggle when we have images and they're not 2D */}
      {!isDisabled && !is2DImage && (
        <div className="absolute top-2 right-16 z-10">
          <div className="bg-[#f0f2f5]/80 dark:bg-[#2a3349]/80 backdrop-blur-sm rounded-md p-1.5 
                         flex items-center gap-2 border border-[#e4e7ec] dark:border-[#4a5583] shadow-md">
            <div className="text-xs font-medium text-[#334155] dark:text-[#e2e8f0] flex items-center gap-1.5">
              {useAdvancedViewer ? (
                <Box className="h-3.5 w-3.5 text-[#4cedff]" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              <span>{useAdvancedViewer ? '3D' : '2D'}</span>
            </div>
            <Toggle
              checked={useAdvancedViewer}
              onCheckedChange={setUseAdvancedViewer}
              size="sm"
              disabled={isDisabled || advancedViewerError || is2DImage}
            />
          </div>
        </div>
      )}

      {useAdvancedViewer ? (
        <div className="w-full h-full relative">
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-[#4cedff]" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading 3D Viewer...</p>
              </div>
            </div>
          }>
            {advancedViewerError ? (
              <AdvancedViewerFallback onReset={() => setUseAdvancedViewer(false)} />
            ) : (
              <AdvancedViewer 
                localFiles={loadedImages?.map(img => img.file)}
                onError={handleAdvancedViewerError}
                activeTool={activeTool} 
                enableSync={true}
              />
            )}
          </Suspense>
        </div>
      ) : (
        <TypedViewportManager3D
          imageIds={allImageIds}
          viewportType={viewportType}
          activeTool={activeTool}
          showTools={false}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          className="w-full h-full"
          onImageLoaded={handleImageLoaded}
        />
      )}

      {loadError && !shouldSuppressErrors && (
        <div className="absolute bottom-2 left-2 px-2 py-1 text-xs font-medium rounded bg-red-500/90 text-white backdrop-blur-sm shadow-sm">
          {loadError}
        </div>
      )}
    </div>
  );
} 