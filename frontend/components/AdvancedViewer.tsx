"use client"

import { useEffect, useRef, useState } from "react"
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  type Types,
  volumeLoader,
  setVolumesForViewports,
  utilities,
  init as csRenderInit,
  imageLoader,
  metaData,
  cache
} from "@cornerstonejs/core"

import {
  init as csToolsInit,
  addTool,
  BrushTool,
  ToolGroupManager,
  Enums as csToolsEnums,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  AngleTool,
  ProbeTool,
  StackScrollTool,
  MagnifyTool,
} from "@cornerstonejs/tools"

import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { mapUiToolToCornerstone3D, type UiToolType } from "@/lib/utils/cornerstone3DInit"
import { cornerstoneService } from '@/lib/services/cornerstoneService';

// Import segmentation API from correct location
import * as cornerstoneTools from "@cornerstonejs/tools";
// We'll access segmentation via cornerstoneTools.segmentation

// Initialize Cornerstone and tools
const initializeCornerstoneAndTools = async () => {
  try {
    await cornerstoneService.initialize();
    console.log('Cornerstone and tools initialized successfully');
  } catch (error) {
    console.error('Error initializing Cornerstone:', error);
    throw error;
  }
};

const { ViewportType } = Enums
const { MouseBindings } = csToolsEnums

// Temporary placeholder for the createImageIdsAndCacheMetaData function
// In a real implementation, you'd import this from your utility file
async function createImageIdsAndCacheMetaData({ 
  StudyInstanceUID, 
  SeriesInstanceUID, 
  wadoRsRoot 
}: { 
  StudyInstanceUID: string; 
  SeriesInstanceUID: string; 
  wadoRsRoot: string; 
}): Promise<string[]> {
  console.log('Using demo image IDs');
  // Return a demo imageId for testing
  return [`wadors:${wadoRsRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/1.2.3.4/frames/1`];
}

// Tool type that matches the UI tools
type ToolType = UiToolType;

interface AdvancedViewerProps {
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  wadoRsRoot?: string;
  localFiles?: File[];
  onError?: () => void;
  activeTool?: UiToolType;
  enableSync?: boolean;
}

export function AdvancedViewer({ 
  studyInstanceUID,
  seriesInstanceUID,
  wadoRsRoot,
  localFiles,
  onError,
  activeTool = 'pan' as UiToolType,
  enableSync = true
}: AdvancedViewerProps) {
  const elementRef1 = useRef<HTMLDivElement>(null)
  const elementRef2 = useRef<HTMLDivElement>(null)
  const elementRef3 = useRef<HTMLDivElement>(null)
  const running = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Component state to track if segmentation is loaded
  const [segmentationLoaded, setSegmentationLoaded] = useState(false)
  
  // Store the current tool group for later use
  const toolGroupRef = useRef<any>(null);

  // Add new refs to store synchronizers
  const syncRefs = useRef<any[]>([]);

  // Call onError if error state is set
  useEffect(() => {
    if (error && onError) {
      onError();
    }
  }, [error, onError]);

  // Define constants for the viewports and tools
  const toolGroupId = "ToolGroup_MPR"
  const toolGroupId2 = "ToolGroup_3D"
  const viewportId1 = "CT_AXIAL"
  const viewportId2 = "CT_SAGITTAL"
  const viewportId3 = "CT_3D"
  const segmentationId = "Segmentation_1"
  const volumeId = "Volume_1"

  // Add renderingEngineId constant at the top with other constants
  const renderingEngineId = "myRenderingEngine";

  useEffect(() => {
    // Create a cleanup function for when component unmounts
    return () => {
      // When component unmounts, we should clean up cornerstone resources
      if (running.current) {
        console.log('Cleaning up cornerstone3D resources');
        try {
          // Clean up synchronizers
          syncRefs.current.forEach(sync => {
            if (sync && typeof sync.destroy === 'function') {
              sync.destroy();
            }
          });
          
          // Clean up logic here - this would include destroying the rendering engine, etc.
          const renderingEngine = window.cornerstone3D?.getRenderingEngine(renderingEngineId);
          if (renderingEngine) {
            renderingEngine.destroy();
          }
        } catch (error) {
          console.error('Error cleaning up cornerstone3D:', error);
        }
        running.current = false;
      }
    };
  }, []);

  // Effect to handle activeTool changes
  useEffect(() => {
    if (!running.current || !toolGroupRef.current) return;
    
    console.log(`AdvancedViewer received activeTool: ${activeTool}, toolGroupRef exists: ${!!toolGroupRef.current}`);
    
    if (activeTool) {
      console.log(`Setting active tool: ${activeTool}`);
      setActiveTool(activeTool);
    }
  }, [activeTool]);

  // Function to set the active tool
  const setActiveTool = (tool: ToolType) => {
    console.log(`setActiveTool called with: ${tool}, toolGroupRef exists: ${!!toolGroupRef.current}`);
    if (!toolGroupRef.current) return;
    
    // Deactivate all tools first
    deactivateAllTools();
    
    // Use our mapping function to get the appropriate tool name
    const toolName = mapUiToolToCornerstone3D(tool);
    console.log(`Mapped UI tool ${tool} to Cornerstone tool: ${toolName}`);
    
    // Activate the selected tool
    if (toolName) {
      console.log(`Activating tool: ${toolName}`);
      
      // Create a standard binding for all tools
      const binding = { mouseButton: csToolsEnums.MouseBindings.Primary };
      
      // Map UI tool name to actual cornerstone3D tool name
      switch (tool) {
        case 'pan':
          toolGroupRef.current.setToolActive("Pan", { bindings: [binding] });
          break;
        case 'zoom':
          toolGroupRef.current.setToolActive("Zoom", { bindings: [binding] });
          break;
        case 'windowLevel':
          toolGroupRef.current.setToolActive("WindowLevel", { bindings: [binding] });
          break;
        case 'length':
          toolGroupRef.current.setToolActive("Length", { bindings: [binding] });
          break;
        case 'rectangleROI':
          toolGroupRef.current.setToolActive("RectangleROI", { bindings: [binding] });
          break;
        case 'angle':
          toolGroupRef.current.setToolActive("Angle", { bindings: [binding] });
          break;
        case 'probe':
          toolGroupRef.current.setToolActive("Probe", { bindings: [binding] });
          break;
        case 'brush':
          toolGroupRef.current.setToolActive("SphereBrush", { bindings: [binding] });
          break;
        default:
          // For unsupported tools, default to Pan
          toolGroupRef.current.setToolActive("Pan", { bindings: [binding] });
      }
    }
  };
  
  // Helper function to deactivate all tools
  const deactivateAllTools = () => {
    if (!toolGroupRef.current) return;
    
    const tools = [
      "Pan", "Zoom", "WindowLevel", "Length", "RectangleROI", 
      "Angle", "Probe", "SphereBrush", "EllipticalROI", "StackScroll", 
      "Magnify"
    ];
    
    tools.forEach(toolName => {
      try {
        toolGroupRef.current.setToolPassive(toolName);
      } catch (e) {
        // Tool might not be added, ignore error
        console.log(`Could not deactivate tool ${toolName}, it may not be added to the tool group`);
      }
    });
  };

  useEffect(() => {
    const setup = async () => {
      if (running.current) {
        console.log('Setup already ran, skipping');
        return;
      }

      // Check if all elements are available
      if (!elementRef1.current || !elementRef2.current || !elementRef3.current) {
        console.error('One or more viewport elements are not available');
        setError('Viewport elements not ready');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        running.current = true;

        // Initialize Cornerstone and tools
        await initializeCornerstoneAndTools();

        // Initialize the rendering engine
        const renderingEngine = new RenderingEngine(renderingEngineId);

        // Create the viewports
        const viewportInput1: Types.PublicViewportInput = {
          viewportId: viewportId1,
          element: elementRef1.current,
          type: ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
          },
        };

        const viewportInput2: Types.PublicViewportInput = {
          viewportId: viewportId2,
          element: elementRef2.current,
          type: ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        };

        const viewportInput3: Types.PublicViewportInput = {
          viewportId: viewportId3,
          element: elementRef3.current,
          type: ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.CORONAL,
          },
        };

        renderingEngine.enableElement(viewportInput1);
        renderingEngine.enableElement(viewportInput2);
        renderingEngine.enableElement(viewportInput3);

        // Get the volume data
        let imageIds: string[] = [];
        
        if (localFiles && localFiles.length > 0) {
          imageIds = await handleLocalFiles(localFiles);
        } else if (studyInstanceUID && seriesInstanceUID && wadoRsRoot) {
          imageIds = await createImageIdsAndCacheMetaData({
            StudyInstanceUID: studyInstanceUID,
            SeriesInstanceUID: seriesInstanceUID,
            wadoRsRoot,
          });
        }

        if (imageIds.length === 0) {
          throw new Error('No images available to load');
        }

        // Create and cache the volume
        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        });

        // Set the volume to load
        volume.load();

        // Set up tool group
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) {
          throw new Error('Failed to create tool group');
        }
        toolGroupRef.current = toolGroup;

        // Add tools to the tool group
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(StackScrollTool.toolName);
        toolGroup.addTool(MagnifyTool.toolName);
        toolGroup.addTool(LengthTool.toolName);
        toolGroup.addTool(RectangleROITool.toolName);
        toolGroup.addTool(EllipticalROITool.toolName);
        toolGroup.addTool(AngleTool.toolName);
        toolGroup.addTool(ProbeTool.toolName);

        // Add the viewports to the toolgroup
        toolGroup.addViewport(viewportId1, renderingEngineId);
        toolGroup.addViewport(viewportId2, renderingEngineId);
        toolGroup.addViewport(viewportId3, renderingEngineId);

        // Set initial active tool
        if (activeTool) {
          setActiveTool(activeTool);
        } else {
          toolGroup.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
        }

        // Set up the viewports
        const viewport1 = renderingEngine.getViewport(viewportId1);
        const viewport2 = renderingEngine.getViewport(viewportId2);
        const viewport3 = renderingEngine.getViewport(viewportId3);

        await setVolumesForViewports(renderingEngine, [
          {
            volumeId,
            callback: ({ volumeActor }) => {
              // Set the volume actor properties
              volumeActor.getProperty().setInterpolationTypeToLinear();
              return volumeActor;
            },
          },
        ], [viewportId1, viewportId2, viewportId3]);

        viewport1.render();
        viewport2.render();
        viewport3.render();

        setIsLoading(false);
      } catch (error) {
        console.error('Error in setup:', error);
        setError('Failed to initialize viewer');
        setIsLoading(false);
        running.current = false;
        if (onError) {
          onError();
        }
      }
    };

    setup();
  }, [studyInstanceUID, seriesInstanceUID, wadoRsRoot, localFiles, activeTool, onError]);

  const convertTo3D = async () => {
    try {
      console.log('Converting segmentation to 3D');
      // add the 3d representation to the 3d toolgroup
      await cornerstoneTools.segmentation.addSegmentationRepresentations(toolGroupId2, [
        {
          segmentationId,
          type: csToolsEnums.SegmentationRepresentations.Surface,
        },
      ])
      
      // Make the volume visible in 3D view
      const renderingEngine = window.cornerstone3D?.getRenderingEngine(renderingEngineId);
      if (renderingEngine) {
        const volumeActor = renderingEngine
          .getViewport(viewportId3)
          .getDefaultActor().actor as Types.VolumeActor;
        volumeActor.setVisibility(true);
        renderingEngine.render();
      }
    } catch (error) {
      console.error('Error converting to 3D:', error);
      setError('Failed to convert to 3D');
    }
  }

  // Replace the brush segmentation function with a simpler one
  const createBrushSegmentation = async () => {
    try {
      if (!toolGroupRef.current) {
        console.error("Tool group not available for brush segmentation");
        return;
      }
      
      console.log('Setting up brush segmentation');
      
      // First deactivate all tools
      deactivateAllTools();
      
      // Explicitly make sure the segmentation display tool is active
      try {
        toolGroupRef.current.setToolEnabled("SegmentationDisplay");
      } catch (error) {
        console.warn("Could not enable SegmentationDisplay tool:", error);
      }
      
      // Set the brush tool active to allow user to draw segmentation
      try {
        toolGroupRef.current.setToolActive('SphereBrush', {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
        });
        console.log('Segmentation brush tool activated - draw on the image to segment');
      } catch (error) {
        console.error("Failed to activate SphereBrush tool:", error);
        setError('Failed to activate brush tool. Please try again.');
        return;
      }
      
      // Render the viewports
      const renderingEngine = window.cornerstone3D?.getRenderingEngine(renderingEngineId);
      if (renderingEngine) {
        renderingEngine.render();
      }
    } catch (error) {
      console.error('Error activating brush segmentation:', error);
      setError('Failed to activate brush segmentation');
    }
  };

  return (
    <div className="flex flex-col space-y-4 relative w-full overflow-hidden bg-white rounded-lg shadow-sm">
      <div className="flex flex-row flex-wrap gap-2 z-10 p-2 border-b border-gray-100">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          onClick={convertTo3D}
          disabled={!segmentationLoaded || isLoading}
        >
          Convert to 3D
        </button>
        
        <button
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
          onClick={createBrushSegmentation}
          disabled={!segmentationLoaded || isLoading}
        >
          Brush Segmentation
        </button>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white z-20">
          <div className="flex flex-col items-center">
            <div className="animate-spin h-8 w-8 border-4 border-t-transparent border-[#4cedff] rounded-full mb-2"></div>
            <p>Initializing advanced viewer...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="text-red-500 bg-red-100 p-2 rounded z-10 mx-2">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-2">
        <div
          ref={elementRef1}
          className="border border-gray-300 rounded-lg overflow-hidden relative shadow-sm"
          style={{
            width: "100%",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
        <div
          ref={elementRef2}
          className="border border-gray-300 rounded-lg overflow-hidden relative shadow-sm"
          style={{
            width: "100%",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
        <div
          ref={elementRef3}
          className="border border-gray-300 rounded-lg overflow-hidden relative shadow-sm"
          style={{
            width: "100%",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
      </div>
    </div>
  )
}

// Helper function to handle local files
async function handleLocalFiles(files: File[]): Promise<string[]> {
  console.log('Local files provided:', files.length);
  
  // Empty array case
  if (!files || files.length === 0) {
    console.warn('No files provided to handleLocalFiles');
    return [];
  }
  
  // Check for DICOMDIR file
  const dicomdirFile = files.find(file => 
    file.name.toUpperCase() === 'DICOMDIR' || 
    file.name.toUpperCase().endsWith('.DICOMDIR')
  );
  
  if (dicomdirFile) {
    console.log('DICOMDIR file detected, will use special handling');
    // Create URL for the DICOMDIR file itself
    const dicomdirUrl = URL.createObjectURL(dicomdirFile);
    
    // Also create imageIds for all other files in the directory
    // since they are likely referenced by the DICOMDIR
    const otherFiles = files.filter(file => file !== dicomdirFile);
    console.log(`Found ${otherFiles.length} additional files along with DICOMDIR`);
    
    try {
      // Try wadouri with all files (including DICOMDIR)
      return [
        `wadouri:${dicomdirUrl}`, 
        ...otherFiles.map(file => {
          const objectUrl = URL.createObjectURL(file);
          return `wadouri:${objectUrl}`;
        })
      ];
    } catch (error) {
      console.error('Failed to load with wadouri prefix for DICOMDIR:', error);
      // Still return the files so something can be displayed
      return files.map(file => {
        const objectUrl = URL.createObjectURL(file);
        return `wadouri:${objectUrl}`;
      });
    }
  }
  
  // Handle multiple DICOM files (but no DICOMDIR)
  const dicomFiles = files.filter(file => 
    file.name.toLowerCase().endsWith('.dcm') || 
    file.name.toLowerCase().includes('.dcm')
  );
  
  if (dicomFiles.length > 0) {
    console.log(`Found ${dicomFiles.length} DICOM files, creating volume stack`);
    
    try {
      // Sort files by name for proper sequence
      dicomFiles.sort((a, b) => a.name.localeCompare(b.name));
      
      // Log information about each file to help with debugging
      dicomFiles.forEach((file, index) => {
        console.log(`DICOM file ${index + 1}/${dicomFiles.length}: ${file.name}, size: ${file.size} bytes`);
      });
      
      return dicomFiles.map(file => {
        const objectUrl = URL.createObjectURL(file);
        return `wadouri:${objectUrl}`;
      });
    } catch (error) {
      console.error('Error processing DICOM files:', error);
      // Return original files as fallback
      return files.map(file => {
        const objectUrl = URL.createObjectURL(file);
        return `wadouri:${objectUrl}`;
      });
    }
  }
  
  // Handle standard image files
  const imageFiles = files.filter(file => 
    file.name.toLowerCase().endsWith('.png') || 
    file.name.toLowerCase().endsWith('.jpg') || 
    file.name.toLowerCase().endsWith('.jpeg')
  );
  
  if (imageFiles.length > 0) {
    console.log(`Found ${imageFiles.length} standard image files`);
    
    return imageFiles.map(file => {
      const objectUrl = URL.createObjectURL(file);
      return `pngimage:${objectUrl}`;
    });
  }
  
  // If we get here, handle as generic files
  console.log('No specific file types recognized, treating as generic files');
  return files.map(file => {
    const objectUrl = URL.createObjectURL(file);
    const filename = file.name.toLowerCase();
    
    // Try to intelligently determine file type
    if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      return `pngimage:${objectUrl}`;
    } else {
      // For other files, use the wadouri scheme as a fallback
      return `wadouri:${objectUrl}`;
    }
  });
}

// Define cornerstone3D on window for cleanup
declare global {
  interface Window {
    cornerstone3D?: {
      getRenderingEngine: (id: string) => any;
    };
  }
} 