import { volumeLoader, Enums, RenderingEngine, Types, metaData, imageLoader } from "@cornerstonejs/core";
import { cornerstoneService } from "./index";

export interface VolumeLoadOptions {
  imageIds: string[];
  volumeId?: string;
  options?: {
    imageIdIndex?: number;
    immediate?: boolean;
  };
}

export interface ViewportOptions {
  viewportId: string;
  type: Enums.ViewportType;
  element: HTMLDivElement;
  orientation?: Enums.OrientationAxis;
  background?: [number, number, number];
}

export class VolumeLoaderService {
  private static instance: VolumeLoaderService;

  private constructor() {}

  static getInstance(): VolumeLoaderService {
    if (!VolumeLoaderService.instance) {
      VolumeLoaderService.instance = new VolumeLoaderService();
    }
    return VolumeLoaderService.instance;
  }

  async loadVolume({ imageIds, volumeId = `volume-${Date.now()}`, options = {} }: VolumeLoadOptions) {
    await cornerstoneService.ensureInitialized();

    try {
      console.log(`Loading volume ${volumeId} with ${imageIds.length} images`);
      
      // Check if we have enough images and proper metadata first
      const canLoadVolume = await this.canLoadAsVolume(imageIds);
      if (!canLoadVolume) {
        console.error('Cannot load these images as a volume - insufficient metadata or too few slices');
        throw new Error('Cannot create volume: insufficient metadata or too few slices');
      }
      
      try {
        // Create and cache the volume
        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
          ...options
        });

        // Load the volume
        await volume.load();

        console.log(`Volume ${volumeId} loaded successfully`);
        return { volumeId, volume };
      } catch (volumeError) {
        console.error('Error during volume creation/loading:', volumeError);
        throw volumeError;
      }
    } catch (error) {
      console.error(`Error loading volume ${volumeId}:`, error);
      throw error;
    }
  }

  async createMPRViewports(
    renderingEngine: RenderingEngine,
    volumeId: string,
    viewports: ViewportOptions[]
  ) {
    try {
      console.log('Setting up MPR viewports');
      
      // Set up the viewports
      renderingEngine.setViewports(viewports);

      // Set the volume on all viewports
      const viewportIds = viewports.map(vp => vp.viewportId);
      await this.setVolumesForViewports(renderingEngine, volumeId, viewportIds);

      console.log('MPR viewports created successfully');
      return viewportIds;
    } catch (error) {
      console.error('Error creating MPR viewports:', error);
      throw error;
    }
  }

  private async setVolumesForViewports(
    renderingEngine: RenderingEngine,
    volumeId: string,
    viewportIds: string[]
  ) {
    try {
      // Get all viewports
      const viewports = viewportIds.map(id => renderingEngine.getViewport(id));

      // Set the volume on each viewport
      await Promise.all(
        viewports.map(async (viewport) => {
          if (viewport.type === Enums.ViewportType.ORTHOGRAPHIC ||
              viewport.type === Enums.ViewportType.VOLUME_3D) {
            await (viewport as Types.IVolumeViewport).setVolumes([
              { volumeId }
            ]);
          }
        })
      );

      // Render all viewports
      renderingEngine.render();
    } catch (error) {
      console.error('Error setting volumes for viewports:', error);
      throw error;
    }
  }

  async canLoadAsVolume(imageIds: string[]): Promise<boolean> {
    if (!imageIds || imageIds.length < 3) {
      console.log('Not enough images for volume loading:', imageIds?.length || 0);
      return false;
    }

    try {
      await cornerstoneService.initialize();
      
      // Load the first image to ensure metadata is available
      try {
        await imageLoader.loadAndCacheImage(imageIds[0]);
      } catch (err) {
        console.error('Failed to load first image for volume check:', err);
        return false;
      }
      
      // Get all available metadata for the first image
      const metadata = {
        imagePixelSpacing: metaData.get('imagePixelSpacing', imageIds[0]),
        pixelSpacing: metaData.get('pixelSpacing', imageIds[0]),
        imageOrientation: metaData.get('imageOrientationPatient', imageIds[0]),
        imagePosition: metaData.get('imagePositionPatient', imageIds[0]),
        sliceThickness: metaData.get('sliceThickness', imageIds[0]),
        sliceLocation: metaData.get('sliceLocation', imageIds[0]),
        rows: metaData.get('rows', imageIds[0]),
        columns: metaData.get('columns', imageIds[0]),
        seriesInstanceUID: metaData.get('seriesInstanceUID', imageIds[0]),
      };
      
      console.log('Volume capability check metadata:', metadata);
      
      // Basic metadata check
      const imageSpacing = metadata.imagePixelSpacing || metadata.pixelSpacing;
      const imageOrientation = metadata.imageOrientation;
      const imagePosition = metadata.imagePosition;
      const sliceThickness = metadata.sliceThickness;
      
      // Log the values to help with debugging
      const metadataStatus = {
        hasSpacing: !!imageSpacing, 
        hasOrientation: !!imageOrientation, 
        hasPosition: !!imagePosition,
        hasThickness: !!sliceThickness,
        imageCount: imageIds.length
      };
      
      console.log('Volume capability check results:', metadataStatus);
      
      // Check if the minimum requirements for a volume are met
      const canLoadVolume = !!imageSpacing && 
                          !!imageOrientation && 
                          !!imagePosition &&
                          !!sliceThickness &&
                          imageIds.length >= 3;
                          
      console.log('Can load as volume:', canLoadVolume);
      return canLoadVolume;
    } catch (error) {
      console.error('Error checking volume loading capability:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const volumeLoaderService = VolumeLoaderService.getInstance(); 