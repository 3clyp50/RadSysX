import { generateSeriesId } from '../utils/idGenerator';
import { RenderingEngine, imageLoader, metaData } from '@cornerstonejs/core';
import dicomParser from 'dicom-parser';
import { cornerstoneService } from '@/lib/services/cornerstoneService';

// Add browser environment check at the top of the file
const isBrowser = typeof window !== 'undefined';

// Initialize Cornerstone service only in browser environment
if (isBrowser) {
  // Initialize using the cornerstone service
  cornerstoneService.initialize()
    .catch(error => {
      console.error('Failed to initialize Cornerstone service:', error);
    });
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

export interface ProcessedImage {
  file: File;
  format: string;
  localUrl: string;
  imageId: string;
  analysis?: ImageAnalysis | null;
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
}

export interface ImageSeries {
  id: string;
  images: ProcessedImage[];
  format: string;
  viewerType: 'dicom' | 'image' | 'video';
  metadata?: {
    modality?: string;
    studyDate?: string;
    seriesDescription?: string;
    isMultiFrame?: boolean;
    totalFrames?: number;
  };
}

export interface FileFormatInfo {
  format: string;
  viewerType: 'dicom' | 'image' | 'video';
}

export async function processImageSeries(files: File[]): Promise<ImageSeries> {
  if (!isBrowser) {
    throw new Error('Image processing can only be done in browser environment');
  }

  if (!files.length) {
    throw new Error('No files provided');
  }

  // Check for DICOMDIR file in the uploaded files
  const dicomdirFile = files.find(file => 
    file.name.toUpperCase() === 'DICOMDIR' || 
    file.name.toUpperCase().endsWith('.DICOMDIR')
  );

  // Special handling for DICOMDIR
  if (dicomdirFile) {
    console.log('DICOMDIR file detected, setting up for 3D viewer');
    
    // We'll use our improved image ID creation
    const allImageIds = await createImageIdsFromFiles([dicomdirFile, ...files.filter(f => f !== dicomdirFile)]);
    
    const processedImages: ProcessedImage[] = allImageIds.map((imageId: string, index: number) => {
      const file = index === 0 ? dicomdirFile : files.filter(f => f !== dicomdirFile)[index - 1];
      return {
        file,
        format: 'dicom',
        localUrl: URL.createObjectURL(file),
        imageId,
        metadata: {
          modality: 'CT', // Assume CT for now
          studyDate: new Date().toISOString().slice(0, 10),
          seriesNumber: '1',
          instanceNumber: (index + 1).toString(),
        }
      };
    });
    
    return {
      id: generateSeriesId(),
      images: processedImages,
      format: 'dicomdir',
      viewerType: 'dicom',
      metadata: {
        modality: 'CT',
        studyDate: new Date().toISOString().slice(0, 10),
        seriesDescription: `DICOMDIR Series ${generateSeriesId()}`,
        isMultiFrame: true,
        totalFrames: processedImages.length
      }
    };
  }

  // If we have multiple files, sort them by name for proper sequence
  files.sort((a, b) => a.name.localeCompare(b.name));
  
  // Use our improved image ID creation
  const allImageIds = await createImageIdsFromFiles(files);
  
  const processedImages: ProcessedImage[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageId = allImageIds[i];
    
    if (!imageId) continue;
    
    try {
      const formatInfo = await determineFileFormat(file);
      const localUrl = URL.createObjectURL(file);
      const metadata = await extractMetadata(file, formatInfo.format);
      
      // Only analyze DICOM and PNG files
      let analysis = null;
      if (formatInfo.format === 'dicom' || formatInfo.format === 'png') {
        analysis = await analyzeImage(file);
      }
      
      processedImages.push({
        file,
        format: formatInfo.format,
        localUrl,
        imageId,
        analysis,
        metadata
      });
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
    }
  }

  const validImages = processedImages.filter(img => img.format !== 'unknown');
  if (!validImages.length) {
    throw new Error('No valid images found in the series');
  }

  // Group images by format
  const formatCounts = validImages.reduce((acc, img) => {
    acc[img.format] = (acc[img.format] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Determine primary format (most common)
  const primaryFormat = Object.entries(formatCounts)
    .sort(([,a], [,b]) => b - a)[0][0];

  // For multiple DICOM files, always use the 3D viewer
  const isMultipleFiles = validImages.length > 1;
  const viewerType = primaryFormat === 'dicom' || primaryFormat === 'dicomdir' ? 'dicom' : 'image';

  // Create series metadata from first valid image
  const firstImage = validImages[0];
  const seriesMetadata = {
    modality: firstImage.metadata?.modality,
    studyDate: firstImage.metadata?.studyDate,
    seriesDescription: `Uploaded Series ${generateSeriesId()}`,
    isMultiFrame: isMultipleFiles,
    totalFrames: validImages.length
  };

  return {
    id: generateSeriesId(),
    images: validImages,
    format: primaryFormat,
    viewerType,
    metadata: seriesMetadata
  };
}

async function getFileFormat(file: File): Promise<string> {
  // Extract just the format string from the full format info
  const formatInfo = await determineFileFormat(file);
  return formatInfo.format;
}

async function determineFileFormat(file: File): Promise<FileFormatInfo> {
  // Check file extension and mime type
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  // First check for DICOM files
  if (ext === 'dcm' || file.type === 'application/dicom') {
    try {
      // Verify if it's actually a DICOM file
      const isDicom = await verifyDicomFormat(file);
      if (isDicom) {
        return { format: 'dicom', viewerType: 'dicom' };
      }
    } catch (error) {
      console.error('Error verifying DICOM format:', error);
    }
  }
  
  // Check for NIFTI files
  if (ext === 'nii' || ext === 'gz' || file.name.toLowerCase().endsWith('.nii.gz')) {
    return { format: 'nifti', viewerType: 'dicom' };
  }
  
  // Then check for other image formats
  if (ext === 'png' || file.type === 'image/png') {
    return { format: 'png', viewerType: 'image' };
  }
  
  if (ext === 'jpg' || ext === 'jpeg' || file.type === 'image/jpeg') {
    return { format: 'jpg', viewerType: 'image' };
  }
  
  // If no valid format is found
  return { format: 'unknown', viewerType: 'image' };
}

async function verifyDicomFormat(file: File): Promise<boolean> {
  try {
    // Check file size first
    if (file.size < 132) {
      return false;
    }

    // Read the first 132 bytes to check for DICOM magic number
    const buffer = await readFileHeader(file, 132);
    if (!buffer) {
      return false;
    }

    // Check for DICOM magic number at offset 128
    const magicNumber = new Uint8Array(buffer).slice(128, 132);
    const magicString = new TextDecoder().decode(magicNumber);
    
    // DICM is the standard DICOM magic number
    if (magicString === 'DICM') {
      return true;
    }

    // Some DICOM files might not have the magic number but still be valid
    // Try to parse metadata as a fallback
    try {
      const metadata = await readDicomMetadata(file);
      return metadata !== null;
    } catch {
      return false;
    }
  } catch (error) {
    console.error('Error in DICOM verification:', error);
    return false;
  }
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

async function readFileHeader(file: File, bytes: number): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

async function extractMetadata(file: File, format: string): Promise<ProcessedImage['metadata']> {
  if (format === 'dicom') {
    try {
      // For DICOM files, attempt to read DICOM metadata
      const metadata = await readDicomMetadata(file);
      return {
        modality: metadata.modality || 'Unknown',
        studyDate: metadata.studyDate || new Date().toISOString(),
        seriesNumber: metadata.seriesNumber || '1',
        instanceNumber: metadata.instanceNumber || '1',
        dimensions: metadata.dimensions
      };
    } catch (error) {
      console.error('Error extracting DICOM metadata:', error);
    }
  } else if (format === 'png') {
    // For PNG files, get dimensions
    const dimensions = await getImageDimensions(file);
    return {
      dimensions: dimensions || undefined
    };
  }
  
  return {};
}

async function readDicomMetadata(file: File): Promise<any> {
  try {
    // Create a blob URL for the file
    const objectUrl = URL.createObjectURL(file);
    
    // Parse DICOM dataset directly using dicom-parser
    const arrayBuffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    
    try {
      const dataSet = dicomParser.parseDicom(byteArray);
      
      const metadata = {
        modality: dataSet.string('x00080060'),
        studyDate: dataSet.string('x00080020'),
        studyInstanceUID: dataSet.string('x0020000d'),
        seriesInstanceUID: dataSet.string('x0020000e'),
        seriesNumber: dataSet.string('x00200011'),
        instanceNumber: dataSet.string('x00200013'),
        dimensions: {
          width: dataSet.uint16('x00280011'),
          height: dataSet.uint16('x00280010')
        },
        windowCenter: dataSet.floatString('x00281050'),
        windowWidth: dataSet.floatString('x00281051'),
        pixelSpacing: dataSet.string('x00280030'),
        rows: dataSet.uint16('x00280010'),
        columns: dataSet.uint16('x00280011'),
        bitsAllocated: dataSet.uint16('x00280100'),
        bitsStored: dataSet.uint16('x00280101'),
        highBit: dataSet.uint16('x00280102'),
        pixelRepresentation: dataSet.uint16('x00280103'),
        planarConfiguration: dataSet.uint16('x00280006'),
        pixelAspectRatio: dataSet.string('x00280034'),
        samplesPerPixel: dataSet.uint16('x00280002')
      };

      return metadata;
    } finally {
      // Clean up the object URL
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.error('Error reading DICOM metadata:', error);
    throw error;
  }
}

export async function uploadImageSeries(series: ImageSeries): Promise<boolean> {
  if (!isBrowser) {
    throw new Error('Image upload can only be done in browser environment');
  }

  try {
    // Upload each image in chunks
    const chunkSize = 50;
    const chunks = [];
    
    for (let i = 0; i < series.images.length; i += chunkSize) {
      chunks.push(series.images.slice(i, i + chunkSize));
    }
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (image) => {
        const formData = new FormData();
        formData.append('file', image.file);
        formData.append('format', image.format);
        formData.append('seriesId', series.id);
        formData.append('metadata', JSON.stringify(image.metadata));
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(`Upload failed: ${result.error}`);
        }

        // Update the image URL to point to the uploaded file
        image.file = new File(
          [image.file], 
          result.path.split('/').pop() || image.file.name,
          { type: image.file.type }
        );
      }));
    }
    
    return true;
  } catch (error) {
    console.error('Error uploading image series:', error);
    return false;
  }
}

export function cleanupImageSeries(series: ImageSeries) {
  if (!isBrowser) return;
  
  if (series?.images) {
    series.images.forEach(image => {
      if (image.localUrl) {
        URL.revokeObjectURL(image.localUrl);
      }
    });
  }
}

async function analyzeImage(file: File): Promise<ImageAnalysis | null> {
  try {
    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('file', file);

    // Send the file to your analysis endpoint
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    const result = await response.json();
    return {
      description: result.description || '',
      findings: result.findings || [],
      measurements: result.measurements || {},
      abnormalities: result.abnormalities || []
    };
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

// Helper function to create image IDs from files
export async function createImageIdsFromFiles(files: File[]): Promise<string[]> {
  if (!files || files.length === 0) {
    return [];
  }

  // Check for DICOMDIR file
  const dicomdirFile = files.find(file => 
    file.name.toUpperCase() === 'DICOMDIR' || 
    file.name.toUpperCase().endsWith('.DICOMDIR')
  );

  if (dicomdirFile) {
    // For DICOMDIR, return both the DICOMDIR file and all other DICOM files
    const dicomdirUrl = URL.createObjectURL(dicomdirFile);
    
    // Process all other files as they are likely referenced by the DICOMDIR
    const otherFiles = files.filter(file => file !== dicomdirFile);
    
    return [
      `wadouri:${dicomdirUrl}`,
      ...otherFiles.map(file => {
        const objectUrl = URL.createObjectURL(file);
        return `wadouri:${objectUrl}`;
      })
    ];
  }

  // Handle multiple DICOM files (without DICOMDIR)
  const dicomFiles = files.filter(file => 
    file.name.toLowerCase().endsWith('.dcm') || 
    file.name.toLowerCase().includes('.dcm') ||
    file.type === 'application/dicom'
  );

  if (dicomFiles.length > 0) {
    // Sort files for proper sequence if they are numbered
    dicomFiles.sort((a, b) => a.name.localeCompare(b.name));
    
    return dicomFiles.map(file => {
      const objectUrl = URL.createObjectURL(file);
      return `wadouri:${objectUrl}`;
    });
  }

  // Handle standard image files
  const imageFiles = files.filter(file => 
    file.type.startsWith('image/') ||
    file.name.toLowerCase().endsWith('.png') || 
    file.name.toLowerCase().endsWith('.jpg') || 
    file.name.toLowerCase().endsWith('.jpeg')
  );

  if (imageFiles.length > 0) {
    return imageFiles.map(file => {
      const objectUrl = URL.createObjectURL(file);
      return `wadouri:${objectUrl}`;
    });
  }

  // Default: treat all files as potential DICOM files
  return files.map(file => {
    const objectUrl = URL.createObjectURL(file);
    return `wadouri:${objectUrl}`;
  });
}