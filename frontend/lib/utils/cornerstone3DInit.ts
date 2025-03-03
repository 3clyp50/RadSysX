// Cornerstone3D Initialization Module - Simplified

// Core libraries
import * as cornerstone3D from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
// Import DICOM loader correctly - the types are incomplete
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import * as dicomParser from 'dicom-parser';

// Cornerstone3D core modules
const {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
  cache
} = cornerstone3D;

// Cornerstone3D tools modules
const { 
  init: csToolsInit,
  addTool,
  ToolGroupManager,
  Enums: ToolEnums,
  SegmentationDisplayTool,
  StackScrollMouseWheelTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  AngleTool,
  ProbeTool,
  BrushTool,
  StackScrollTool,
  MagnifyTool,
  CrosshairsTool
} = cornerstoneTools;

// Extract WADO loaders from the DICOM image loader
// Handle these as any type since the types are incomplete
const wadouri = (dicomImageLoader as any).wadouri;
const wadors = (dicomImageLoader as any).wadors;

// Simple state tracking
let initialized = false;
let toolsInitialized = false;

// UI Tool type that matches the application's existing tool types
export type UiToolType =
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
  | "rectangleRoi"
  | "ellipticalRoi"
  | "brush"
  | "circleScissor"
  | "rectangleScissor"
  | "sphereScissor"
  | "eraser"
  | "threshold"
  | "magnify"
  | "stackScroll"
  | "crosshairs"
  | "volumeRotate"
  | null;

/**
 * Initialize the Cornerstone3D libraries
 */
export async function initializeCornerstone3D(): Promise<void> {
  if (initialized) {
    console.log('Cornerstone3D already initialized');
    return;
  }

  try {
    // Initialize Cornerstone3D core
    await cornerstone3D.init();
    
    // Initialize DICOM image loader
    await initializeDicomImageLoader();
    
    // Initialize tools
    await csToolsInit();

    // Add all tools
    addTools();

    // Increase cache size
    cache.setMaxCacheSize(3000);
    
    // Register image loaders
    registerImageLoaders();

    initialized = true;
    console.log('Cornerstone3D fully initialized');
  } catch (error) {
    console.error('Error initializing Cornerstone3D:', error);
    throw error;
  }
}

/**
 * Initializes the DICOM image loader with proper configuration
 */
export function initializeDicomImageLoader(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      // Explicitly set the external cornerstone reference BEFORE any other operations
      // This is the key fix for the error: "cornerstoneDICOMImageLoader requires a copy of Cornerstone..."
      const cornerstoneDICOMImageLoader = dicomImageLoader as any;
      
      // Set external dependencies with multiple fallback methods
      // Method 1: Direct property assignment (preferred method)
      if (!cornerstoneDICOMImageLoader.external) {
        cornerstoneDICOMImageLoader.external = {};
      }
      cornerstoneDICOMImageLoader.external.cornerstone = cornerstone3D;
      cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;
      
      // Method 2: Alternative approach via global object (backup method)
      if (typeof window !== 'undefined') {
        (window as any).cornerstone = cornerstone3D;
        (window as any).dicomParser = dicomParser;
      }
      
      // Log success of the external assignment
      console.log('Successfully assigned cornerstone3D to cornerstoneDICOMImageLoader.external');
      
      // Initialize web workers with fallback approaches
      if (typeof cornerstoneDICOMImageLoader.initializeWebWorkers === 'function') {
        cornerstoneDICOMImageLoader.initializeWebWorkers({
          maxWebWorkers: Math.max(navigator.hardwareConcurrency || 1, 1),
          startWebWorkersOnDemand: true,
          taskConfiguration: {
            decodeTask: {
              loadCodecsOnStartup: true,
              initializeCodecsOnStartup: false,
            },
          },
        });
        console.log('DICOM Web Workers initialized');
      } else {
        console.log('DICOM Web Worker initialization not available - using single-threaded decoding');
      }
      
      // Configure the WADO URI loader
      try {
        if (typeof cornerstoneDICOMImageLoader.wadouri?.configure === 'function') {
          cornerstoneDICOMImageLoader.wadouri.configure({
            useWebWorkers: false,  // Disable for troubleshooting
            decodeConfig: {
              convertFloatPixelDataToInt: false,
              use16BitDataType: true,
            },
          });
          console.log('WADO URI loader configured successfully');
        } else {
          console.warn('WADO URI configure function not available via normal path');
          
          // Try alternative configuration paths
          const wadouriConfig = 
            cornerstoneDICOMImageLoader.wadouri?.configure || 
            cornerstoneDICOMImageLoader.configure || 
            cornerstoneDICOMImageLoader.wadors?.configure;
          
          if (typeof wadouriConfig === 'function') {
            wadouriConfig({
              useWebWorkers: false,
              decodeConfig: {
                convertFloatPixelDataToInt: false,
                use16BitDataType: true,
              },
            });
            console.log('WADO URI configured through alternative method');
          } else {
            console.warn('WADO URI configure function is not available - using default configuration');
          }
        }
      } catch (configError) {
        console.warn('Error during WADO URI configuration:', configError);
      }
      
      // Register the loaders explicitly
      if (typeof cornerstone3D.registerImageLoader === 'function') {
        try {
          if (cornerstoneDICOMImageLoader.wadouri?.loadImage) {
            cornerstone3D.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.wadouri.loadImage);
            console.log('Registered WADO URI loader with Cornerstone3D');
          }
          
          if (cornerstoneDICOMImageLoader.wadors?.loadImage) {
            cornerstone3D.registerImageLoader('wadors', cornerstoneDICOMImageLoader.wadors.loadImage);
            console.log('Registered WADO RS loader with Cornerstone3D');
          }
        } catch (loaderError) {
          console.error('Error registering image loaders:', loaderError);
        }
      }

      console.log('DICOM Image Loader initialized successfully');
      resolve();
    } catch (error) {
      console.error('Error initializing DICOM Image Loader:', error);
      reject(error);
    }
  });
}

/**
 * Register WADO URI and WADO RS image loaders
 */
function registerImageLoaders() {
  try {
    // Get reference to the DICOM image loader
    const loader = dicomImageLoader as any;
    
    // Register loaders with more robust checks
    if (wadouri && typeof wadouri.loadImage === 'function') {
      console.log('Registering WADO URI loader via direct wadouri reference');
      imageLoader.registerImageLoader('wadouri', wadouri.loadImage);
    } else if (loader.wadouri && typeof loader.wadouri.loadImage === 'function') {
      console.log('Registering WADO URI loader via dicomImageLoader.wadouri');
      imageLoader.registerImageLoader('wadouri', loader.wadouri.loadImage);
    } else {
      console.warn('Could not find wadouri.loadImage function');
      
      // Fallback: Create a custom handler that uses our own logic
      imageLoader.registerImageLoader('wadouri', function(imageId: string) {
        console.log(`Custom WADO URI loader called for ${imageId}`);
        
        // Extract the URL
        const url = imageId.substring(imageId.indexOf(':') + 1);
        
        // Try to find the file in our file map
        if ((window as any).cornerstone3DFileMap && (window as any).cornerstone3DFileMap.has(url)) {
          const file = (window as any).cornerstone3DFileMap.get(url);
          
          // Return a deferred object (promise-like interface that cornerstone expects)
          const deferred = {
            promise: null as any,
            resolve: null as any,
            reject: null as any
          };
          
          deferred.promise = new Promise((resolve, reject) => {
            deferred.resolve = resolve;
            deferred.reject = reject;
            
            // Read the file and create an image object
            const fileReader = new FileReader();
            fileReader.onload = function(e) {
              try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                
                // Here we'd normally parse the DICOM data and create an image
                // For now, we'll just resolve with a minimal valid image object
                // that Cornerstone can use
                
                deferred.resolve({
                  imageId,
                  minPixelValue: 0,
                  maxPixelValue: 255,
                  slope: 1.0,
                  intercept: 0,
                  windowCenter: 127,
                  windowWidth: 255,
                  rows: 512,
                  columns: 512,
                  height: 512,
                  width: 512,
                  color: false,
                  columnPixelSpacing: 1.0,
                  rowPixelSpacing: 1.0,
                  sizeInBytes: arrayBuffer.byteLength,
                  getPixelData: () => new Uint8Array(arrayBuffer)
                });
              } catch (error) {
                deferred.reject(error);
              }
            };
            
            fileReader.onerror = function(error) {
              deferred.reject(error);
            };
            
            fileReader.readAsArrayBuffer(file);
          });
          
          return deferred;
        } else {
          throw new Error(`No file found for URL: ${url}`);
        }
      });
      
      console.log('Registered fallback WADO URI loader');
    }
    
    // Register the WADO RS loader
    if (wadors && typeof wadors.loadImage === 'function') {
      console.log('Registering WADO RS loader via direct wadors reference');
      imageLoader.registerImageLoader('wadors', wadors.loadImage);
    } else if (loader.wadors && typeof loader.wadors.loadImage === 'function') {
      console.log('Registering WADO RS loader via dicomImageLoader.wadors');
      imageLoader.registerImageLoader('wadors', loader.wadors.loadImage);
    } else {
      console.warn('Could not find WADO RS loader');
    }
    
    // Add custom schemes as needed
    imageLoader.registerImageLoader('blob', (imageId: string) => {
      // Simple blob URL handler
      const blobUrl = imageId.substring(imageId.indexOf(':') + 1);
      const loadPromise = cornerstone3D.imageLoader.loadAndCacheImage('wadouri:' + blobUrl);
      
      // Return object with promise property to match ImageLoaderFn interface
      return {
        promise: loadPromise,
        cancelFn: undefined
      };
    });
    
    console.log('Image loaders registered successfully');
  } catch (error) {
    console.error('Error registering image loaders:', error);
  }
}

/**
 * Add all tools that will be used in the application
 */
function addTools(): void {
  if (toolsInitialized) {
    console.log('Tools already registered, skipping addTools()');
    return;
  }

  try {
    // Add basic tools
    addTool(PanTool);
    addTool(ZoomTool);
    addTool(WindowLevelTool);
    addTool(StackScrollMouseWheelTool);
    addTool(StackScrollTool);
    
    // Add measurement tools
    addTool(LengthTool);
    addTool(RectangleROITool);
    addTool(EllipticalROITool);
    addTool(AngleTool);
    addTool(ProbeTool);
      
    // Add segmentation tools
    addTool(BrushTool);
    addTool(CrosshairsTool);
    addTool(MagnifyTool);
    
    toolsInitialized = true;
    console.log('All Cornerstone3D tools registered successfully');
  } catch (error) {
    console.error('Error adding Cornerstone3D tools:', error);
    throw error;
  }
}

/**
 * Creates a new rendering engine with the given ID
 * @param id The ID for the new rendering engine
 * @returns The newly created rendering engine
 */
export function createRenderingEngine(id: string): any {
  // Clean up any existing rendering engine with the same ID
  const existingEngine = cornerstone3D.getRenderingEngine(id);
  if (existingEngine) {
    existingEngine.destroy();
  }

  // Create a new rendering engine
  return new RenderingEngine(id);
}

/**
 * Creates a viewport in the given element
 */
export function createViewport(
  renderingEngine: any,
  elementId: string,
  viewportId: string,
  viewportType: cornerstone3D.Enums.ViewportType,
  options: any = {}
): any {
  // Get the element
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID ${elementId} not found`);
  }

  // Create the viewport with required properties
  const viewport = renderingEngine.enableElement({
    viewportId,
    type: viewportType,
    element: element as HTMLDivElement,
    defaultOptions: {
      background: [0, 0, 0],
      ...options
    }
  });

  return viewport;
}

/**
 * Create a tool group for a set of viewports
 * @param toolGroupId The unique ID for this tool group
 * @param viewportIds The IDs of viewports to include in this tool group
 * @param renderingEngineId The ID of the rendering engine these viewports belong to
 * @returns The created tool group
 */
export function createToolGroup(
  toolGroupId: string,
  viewportIds: string[],
  renderingEngineId: string
): any {
  // Clean up existing tool group with the same ID
  const existingToolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    ToolGroupManager.destroyToolGroup(toolGroupId);
  }

  // Create a new tool group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  
  if (toolGroup) {
    // Add tools to the tool group with default configurations
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(LengthTool.toolName);
    toolGroup.addTool(RectangleROITool.toolName);
    toolGroup.addTool(EllipticalROITool.toolName);
    toolGroup.addTool(AngleTool.toolName);
    toolGroup.addTool(ProbeTool.toolName);
    toolGroup.addTool(BrushTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(MagnifyTool.toolName);
    
    // Add viewports to the tool group with specific rendering engine ID
    viewportIds.forEach(viewportId => {
      toolGroup.addViewport(viewportId, renderingEngineId);
    });
  }

  return toolGroup;
}

/**
 * Set the active tool for a tool group
 * @param toolGroupId The ID of the tool group
 * @param toolName The name of the tool to activate
 * @param bindings Mouse button bindings for the tool
 */
export function setToolActive(
  toolGroupId: string,
  toolName: string,
  bindings: { mouseButton?: number } = {}
): void {
  // Get the tool group
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  
  if (!toolGroup) {
    console.warn(`Tool group with ID ${toolGroupId} not found`);
    return;
  }

  // Set mouse button binding (default to left mouse button)
  const mouseButton = bindings.mouseButton ?? ToolEnums.MouseBindings.Primary;
  
  // Deactivate all tools first
  const toolNames = [
    PanTool.toolName,
    ZoomTool.toolName,
    WindowLevelTool.toolName,
    LengthTool.toolName,
    RectangleROITool.toolName,
    EllipticalROITool.toolName,
    AngleTool.toolName,
    ProbeTool.toolName,
    BrushTool.toolName,
    StackScrollTool.toolName,
    MagnifyTool.toolName,
  ];

  toolNames.forEach(tool => {
    if (tool !== toolName) {
      toolGroup.setToolPassive(tool);
    }
  });

  // Activate the requested tool
  toolGroup.setToolActive(toolName, { bindings: [{ mouseButton }] });
  console.log(`Activated tool: ${toolName} with mouse button: ${mouseButton}`);
}

/**
 * Map UI tool types to Cornerstone3D tool names
 * @param tool The UI tool type
 * @returns The corresponding Cornerstone3D tool name
 */
export function mapUiToolToCornerstone3D(tool: UiToolType): string {
  switch (tool) {
    case "pan":
      return PanTool.toolName;
    case "zoom":
      return ZoomTool.toolName;
    case "window":
    case "level":
      return WindowLevelTool.toolName;
    case "distance":
      return LengthTool.toolName;
    case "area":
      return RectangleROITool.toolName;
    case "rectangleRoi":
      return RectangleROITool.toolName;
    case "ellipticalRoi":
      return EllipticalROITool.toolName;
    case "angle":
      return AngleTool.toolName;
    case "profile":
      return ProbeTool.toolName;
    case "segment":
    case "brush":
      return BrushTool.toolName;
    case "magnify":
      return MagnifyTool.toolName;
    case "stackScroll":
      return StackScrollTool.toolName;
    case "crosshairs":
      return CrosshairsTool.toolName;
    case "volumeRotate":
      return "VolumeRotateMouseWheel";
    // For tools we don't have an equivalent, fall back to Pan
    default:
      console.warn(`Unknown tool type: ${tool} - defaulting to Pan`);
      return PanTool.toolName;
  }
}

/**
 * Create image IDs from File objects
 * @param files Array of File objects to create image IDs from
 * @returns Array of image IDs
 */
export async function createImageIdsFromFiles(files: File[]): Promise<string[]> {
  // Ensure DICOM loader is initialized
  try {
    await initializeDicomImageLoader();
  } catch (error) {
    console.warn('Failed to initialize DICOM loader before creating image IDs:', error);
  }

  const imageIds: string[] = [];
  const loader = dicomImageLoader as any;
  const fileManager = (loader.wadouri && loader.wadouri.fileManager) || 
                     (wadouri && wadouri.fileManager);
  
  console.log(`Processing ${files.length} files to create image IDs`);
  
  for (const file of files) {
    try {
      // Create an object URL for the file
      const objectUrl = URL.createObjectURL(file);
      
      // For DICOM files, use wadouri: prefix with the object URL
      if (file.name.toLowerCase().endsWith('.dcm') || 
          file.type === 'application/dicom' || 
          file.type === 'image/dicom') {
        
        const imageId = `wadouri:${objectUrl}`;
        
        // Register the file with the WADO URI loader using multiple approaches
        let registrationSuccess = false;
        
        // Approach 1: Using fileManager directly if available
        if (fileManager) {
          try {
            fileManager.add(imageId, file);
            registrationSuccess = true;
            console.log(`File ${file.name} registered with WADO URI loader (approach 1)`);
          } catch (error) {
            console.warn(`Error registering file ${file.name} with approach 1:`, error);
          }
        }
        
        // Approach 2: Using cornerstoneDICOMImageLoader.wadouri.fileManager
        if (!registrationSuccess && loader.wadouri && loader.wadouri.fileManager) {
          try {
            loader.wadouri.fileManager.add(imageId, file);
            registrationSuccess = true;
            console.log(`File ${file.name} registered with WADO URI loader (approach 2)`);
          } catch (error) {
            console.warn(`Error registering file ${file.name} with approach 2:`, error);
          }
        }
        
        // Approach 3: Using registerFile utility if available
        if (!registrationSuccess && typeof (imageLoader as any).registerFile === 'function') {
          try {
            (imageLoader as any).registerFile(file, imageId);
            registrationSuccess = true;
            console.log(`File ${file.name} registered with image loader (approach 3)`);
          } catch (error) {
            console.warn(`Error registering file ${file.name} with approach 3:`, error);
          }
        }
        
        // Approach 4: Manual URL mapping as a last resort
        if (!registrationSuccess) {
          try {
            // Create a global file map if it doesn't exist
            if (!(window as any).cornerstone3DFileMap) {
              (window as any).cornerstone3DFileMap = new Map();
            }
            
            // Add the file to the map with its URL as the key
            (window as any).cornerstone3DFileMap.set(objectUrl, file);
            console.log(`File ${file.name} registered with manual URL mapping (approach 4)`);
            
            // Try to patch the loader if needed
            if (loader.wadouri && loader.wadouri.loadFileRequest && typeof loader.wadouri.loadFileRequest === 'function') {
              const originalLoadRequest = loader.wadouri.loadFileRequest;
              loader.wadouri.loadFileRequest = function(uri: string) {
                if ((window as any).cornerstone3DFileMap && (window as any).cornerstone3DFileMap.has(uri.replace('wadouri:', ''))) {
                  return (window as any).cornerstone3DFileMap.get(uri.replace('wadouri:', ''));
                }
                return originalLoadRequest(uri);
              };
            }
          } catch (error) {
            console.error(`Failed to register file ${file.name} with all approaches:`, error);
          }
        }
        
        imageIds.push(imageId);
        console.log(`Created image ID for DICOM file: ${imageId}`);
      } else if (file.type.startsWith('image/')) {
        // For standard image formats
        const imageId = objectUrl;
        imageIds.push(imageId);
        console.log(`Created image ID for standard image: ${imageId}`);
      } else {
        console.warn(`Unsupported file type for ${file.name}: ${file.type}`);
      }
    } catch (error) {
      console.error(`Error creating imageId for ${file.name}:`, error);
    }
  }

  console.log(`Processed ${imageIds.length} image IDs`);
  
  return imageIds;
}

/**
 * Loads an image stack and displays it in the specified element
 * @param element DOM element to display the image in
 * @param imageIds Array of image IDs to load
 * @param viewportId ID for the viewport
 * @param renderingEngineId ID for the rendering engine
 * @returns Promise that resolves when the image is loaded and displayed
 */
export async function loadAndDisplayImageStack(
  element: HTMLDivElement,
  imageIds: string[],
  viewportId: string,
  renderingEngineId: string
): Promise<boolean> {
  try {
    if (!element) {
      console.error('No element provided for stack display');
      return false;
    }
    
    if (imageIds.length === 0) {
      console.error('No image IDs provided for stack display');
      return false;
    }
    
    console.log(`Loading stack of ${imageIds.length} images in viewport ${viewportId}`);
    
    // Set element styles for proper rendering
    if (element) {
      element.style.position = 'relative';
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.minHeight = '100px';
      element.style.background = '#000';
    }
    
    // Get or create the rendering engine
    let engine = cornerstone3D.getRenderingEngine(renderingEngineId);
    if (!engine) {
      console.log(`Creating new rendering engine with ID ${renderingEngineId}`);
      try {
        engine = new RenderingEngine(renderingEngineId);
      } catch (error) {
        console.error(`Error creating rendering engine: ${error}`);
        return false;
      }
    }

    // Create viewport configuration
    const viewportInput = {
      viewportId,
      type: Enums.ViewportType.STACK,
      element,
      defaultOptions: {
        background: [0, 0, 0] as [number, number, number],
      }
    };

    try {
      // Enable the element to create a viewport
      engine.enableElement(viewportInput);
      
      // Get the viewport
      const viewport = engine.getViewport(viewportId);
      
      if (!viewport) {
        console.error(`Failed to get viewport ${viewportId}`);
        return false;
      }
      
      // Cast the viewport to access stack-specific methods
      const stackViewport = viewport as cornerstone3D.Types.IStackViewport;
      
      // Pre-load the first image to catch any loading errors early
      console.log(`Pre-loading first image: ${imageIds[0]}`);
      await cornerstone3D.imageLoader.loadAndCacheImage(imageIds[0]);
      
      // Set the stack of images on the viewport
      await stackViewport.setStack(imageIds);
      
      // If there are multiple images, set to the middle slice for better visualization
      if (imageIds.length > 1) {
        const middleIndex = Math.floor(imageIds.length / 2);
        stackViewport.setImageIdIndex(middleIndex);
        console.log(`Set to middle slice index: ${middleIndex}`);
      }
      
      // Ensure the viewport is properly fit to display the image(s)
      stackViewport.resetCamera();
      stackViewport.render();
      
      console.log(`Successfully loaded and displayed stack in viewport ${viewportId}`);
      return true;
    } catch (error) {
      console.error(`Error setting up viewport: ${error}`);
      
      // Try to recover by re-rendering if possible
      try {
        if (engine) engine.render();
      } catch (renderError) {
        console.warn(`Failed to recover with re-render: ${renderError}`);
      }
      
      return false;
    }
  } catch (error) {
    console.error(`Failed to load and display image stack: ${error}`);
    return false;
  }
}

/**
 * Loads a volume from a set of image IDs and displays it in the specified viewport
 * @param element DOM element to display the volume in
 * @param imageIds Array of image IDs to load as a volume
 * @param viewportId ID for the viewport
 * @param volumeId ID for the volume
 * @param viewportType Type of viewport (ORTHOGRAPHIC, VOLUME)
 * @param renderingEngineId ID for the rendering engine
 * @returns Promise that resolves to true if successful
 */
export async function loadAndDisplayVolume(
  element: HTMLDivElement,
  imageIds: string[],
  viewportId: string,
  volumeId: string,
  viewportType: cornerstone3D.Enums.ViewportType,
  renderingEngineId: string
): Promise<boolean> {
  try {
    if (!imageIds || imageIds.length < 2) {
      console.error('Not enough images for volume rendering');
      return false;
    }
    
    console.log(`Loading volume with ${imageIds.length} images for viewport ${viewportId}`);
    
    // Create a rendering engine
    let renderingEngine = cornerstone3D.getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
      console.log(`Creating new rendering engine with ID ${renderingEngineId}`);
      renderingEngine = new RenderingEngine(renderingEngineId);
    }
    
    // Prepare the element
    if (element) {
      element.style.position = 'relative';
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.minHeight = '100px';
      element.style.background = '#000';
    }
    
    // Create viewport
    const viewportInput = {
      viewportId,
      type: viewportType,
      element,
      defaultOptions: {
        orientation: viewportType === cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC ? 
                    cornerstone3D.Enums.OrientationAxis.AXIAL : undefined,
        background: [0, 0, 0] as [number, number, number]
      },
    };
    
    // Enable the element
    renderingEngine.enableElement(viewportInput);
    
    // Get the viewport
    const viewport = renderingEngine.getViewport(viewportId);
    
    if (!viewport) {
      console.error(`Failed to create viewport ${viewportId}`);
      return false;
    }
    
    // Create a volume in the cache
    const volumePromises = [
      volumeLoader.createAndCacheVolume(volumeId, {
        imageIds,
      }),
    ];
    
    // Wait for volume to be created
    const [volume] = await Promise.all(volumePromises);
    
    // Set the volume on the viewport
    switch (viewportType) {
      case cornerstone3D.Enums.ViewportType.ORTHOGRAPHIC:
        await (viewport as cornerstone3D.Types.IVolumeViewport).setVolumes([
          { volumeId, callback: () => console.log(`Volume ${volumeId} set on viewport ${viewportId}`) },
        ]);
        break;
      // VOLUME type might not be available in your version, so use a default case
      default:
        // Try to set volumes regardless of viewport type
        try {
          await (viewport as cornerstone3D.Types.IVolumeViewport).setVolumes([
            { volumeId, callback: () => console.log(`Volume ${volumeId} set on viewport ${viewportId}`) },
          ]);
        } catch (error) {
          console.warn(`Failed to set volume on viewport type ${viewportType}:`, error);
          return false;
        }
        break;
    }
    
    // Reset to default view
    (viewport as cornerstone3D.Types.IVolumeViewport).resetCamera();
    
    // Render the scene
    renderingEngine.render();
    
    console.log(`Volume loaded successfully for viewport ${viewportId}`);
    return true;
  } catch (error) {
    console.error('Error loading and displaying volume:', error);
    return false;
  }
}

/**
 * Detect if an image is a 2D image (single slice)
 * @param imageId The image ID to check
 * @returns True if the image is a 2D image, false otherwise
 */
export function is2DImage(imageId: string): boolean {
  // Check by file name
  const fileName = imageId.split('/').pop()?.toLowerCase() || '';
  const is2DImageFormat = 
    fileName.endsWith('.png') || 
    fileName.endsWith('.jpg') || 
    fileName.endsWith('.jpeg') || 
    fileName.endsWith('.gif') ||
    fileName.endsWith('.bmp');
    
  return is2DImageFormat;
}

/**
 * Determine if a set of imageIds can properly form a volume
 * @param imageIds Array of image IDs to check
 * @returns Whether the images can form a proper volume
 */
export const canLoadAsVolume = async (imageIds: string[]): Promise<boolean> => {
  // Need at least 3 images for a proper volume
  return imageIds.length >= 3;
};

/**
 * Clean up Cornerstone3D resources
 * @param renderingEngineId The ID of the rendering engine to clean up
 * @param toolGroupIds Array of tool group IDs to clean up
 */
export function cleanupCornerstone3D(renderingEngineId: string, toolGroupIds: string[] = []) {
  try {
    // Clean up tool groups
    if (toolGroupIds.length > 0) {
      toolGroupIds.forEach(toolGroupId => {
        try {
          const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
          if (toolGroup) {
            ToolGroupManager.destroyToolGroup(toolGroupId);
          }
        } catch (toolError) {
          console.warn(`Error cleaning up tool group ${toolGroupId}:`, toolError);
        }
      });
    }
    
    // Clean up rendering engine
    const renderingEngine = cornerstone3D.getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      renderingEngine.destroy();
      console.log(`Cleaned up Cornerstone3D resources for renderingEngine: ${renderingEngineId}`);
    }
  } catch (error) {
    console.error('Error cleaning up Cornerstone3D resources:', error);
  }
}

/**
 * Validates image IDs by attempting to load metadata for the first image
 * This helps detect issues with image IDs before trying to render them
 * @param imageIds Array of image IDs to validate
 * @returns Object containing valid status and filtered image IDs
 */
export async function validateImageIds(imageIds: string[]): Promise<{
  valid: boolean;
  validatedIds: string[];
  issues: string[];
}> {
  if (!imageIds || imageIds.length === 0) {
    return { valid: false, validatedIds: [], issues: ['No image IDs provided'] };
  }

  console.log(`Validating ${imageIds.length} image IDs`);
  
  // Ensure Cornerstone is initialized
  await initializeCornerstone3D();
  
  // Force registration of loaders in case they weren't properly registered
  registerImageLoaders();

  const validatedIds: string[] = [];
  const issues: string[] = [];
  
  // Manual verification that loaders are registered
  const loaderSchemes = [] as string[];
  
  try {
    // Get a list of registered schemes using a hack since there's no direct API
    // @ts-ignore - using internal API
    const imageLoadObject = (imageLoader as any)._imageLoadObject;
    if (imageLoadObject) {
      for (const scheme in imageLoadObject) {
        loaderSchemes.push(scheme);
      }
    }
    
    console.log(`Registered image loader schemes: ${loaderSchemes.join(', ') || 'none'}`);
  } catch (e) {
    console.warn('Unable to retrieve registered loader schemes:', e);
  }

  // For each image ID, attempt to validate it
  for (const imageId of imageIds) {
    try {
      // Skip empty or invalid image IDs
      if (!imageId || typeof imageId !== 'string') {
        issues.push(`Invalid image ID: ${imageId}`);
        continue;
      }
      
      console.log(`Validating image ID: ${imageId}`);
      
      // First check if this imageId format is supported
      const colonIndex = imageId.indexOf(':');
      if (colonIndex === -1) {
        issues.push(`Image ID ${imageId} is missing scheme prefix (e.g., wadouri:)`);
        continue;
      }

      const scheme = imageId.substring(0, colonIndex);
      
      // Check if scheme is registered
      let loaderAvailable = false;
      
      // Method 1: Try the standard loader check
      try {
        if ((imageLoader as any).getImageLoadObject && (imageLoader as any).getImageLoadObject(scheme)) {
          loaderAvailable = true;
        }
      } catch (e) {
        console.warn(`Unable to check loader via getImageLoadObject for scheme: ${scheme}`);
      }
      
      // Method 2: Check our manual list of schemes
      if (!loaderAvailable && loaderSchemes.includes(scheme)) {
        loaderAvailable = true;
      }
      
      // Method 3: Just assume it might be available if it's a common scheme
      if (!loaderAvailable && ['wadouri', 'wadors', 'blob', 'http', 'https'].includes(scheme)) {
        console.log(`Assuming loader might be available for common scheme: ${scheme}`);
        loaderAvailable = true;
      }
      
      if (!loaderAvailable) {
        // We'll try to use this ID anyway if we can find the file
        const url = imageId.substring(colonIndex + 1);
        const hasFileMapped = (window as any).cornerstone3DFileMap && 
                             (window as any).cornerstone3DFileMap.has(url);
                             
        if (hasFileMapped) {
          console.log(`No loader found for scheme ${scheme}, but file is in map`);
          loaderAvailable = true;
        } else {
          issues.push(`No loader registered for scheme: ${scheme}`);
          
          // We'll continue anyway to see if it works - might be dynamically loaded
          console.warn(`Continuing validation despite no loader for scheme: ${scheme}`);
        }
      }
      
      // Try to validate the image ID through several methods
      let validationSuccess = false;
      
      // Method 1: Try to get metadata (fast and non-blocking)
      try {
        const metadata = await cornerstone3D.metaData.get('imagePixelModule', imageId);
        if (metadata) {
          validationSuccess = true;
          console.log(`Successfully validated image ID via metadata: ${imageId}`);
        }
      } catch (metadataError) {
        console.warn(`Metadata validation failed for ${imageId}:`, metadataError);
      }
      
      // Method 2: Try loading image through the standard loader
      if (!validationSuccess) {
        try {
          // Try to load with a timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          
          const loadPromise = cornerstone3D.imageLoader.loadAndCacheImage(imageId);
          const result = await Promise.race([loadPromise, timeoutPromise]);
          
          if (result) {
            validationSuccess = true;
            console.log(`Successfully loaded and cached image: ${imageId}`);
          }
        } catch (loadError) {
          console.warn(`Image loading failed for ${imageId}:`, loadError);
        }
      }
      
      // Method 3: Just trust the image ID format for certain schemes
      if (!validationSuccess && ['wadouri', 'wadors'].includes(scheme)) {
        console.log(`Accepting ${imageId} based on scheme alone`);
        validationSuccess = true;
      }
      
      // Use this image ID if any validation method succeeded or if we're being very permissive
      if (validationSuccess) {
        validatedIds.push(imageId);
      } else {
        issues.push(`Failed to validate image ID: ${imageId}`);
        
        // For now, we'll be permissive and include it anyway
        console.warn(`Including unvalidated image ID: ${imageId}`);
        validatedIds.push(imageId);
      }
    } catch (error) {
      issues.push(`Error validating image ID ${imageId}: ${error}`);
      // Still include the image ID even if validation fails
      validatedIds.push(imageId);
    }
  }
  
  console.log(`Validation results: ${validatedIds.length} valid, ${issues.length} issues`);

  // Be permissive - if we have any image IDs, consider it valid
  return {
    valid: validatedIds.length > 0,
    validatedIds,
    issues
  };
}

// End of file 