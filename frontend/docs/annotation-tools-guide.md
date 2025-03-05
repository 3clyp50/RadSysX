# RadSysX Annotation Tools Guide

This guide provides an overview of the annotation tools implementation in RadSysX, including the current status, known issues, and usage examples.

## Architecture Overview

The annotation system consists of several components that work together to provide a complete annotation experience:

1. **AnnotationToolbar.tsx** - UI component for selecting annotation tools
2. **AnnotationManager.tsx** - UI component for managing annotations
3. **annotationManager.ts** - Service for interacting with Cornerstone3D annotation APIs
4. **cornerstone3DInit.ts** - Initializes Cornerstone3D tools and provides mapping between UI and Cornerstone tools

## Current Implementation Status

Here's the current state of the annotation system:

### What Works:
- Basic tool selection through the `AnnotationToolbar`
- Drawing annotations on the viewport (distance, angle, rectangle ROI, elliptical ROI, circle ROI)
- Tracking of created annotations
- Integration with Cornerstone3D tools
- Basic annotation management for selection, visibility, and deletion

### Known Issues to Fix:
- UI component JSX issues in `AnnotationManager.tsx` and `AnnotationToolbar.tsx`
- Type mismatches with Cornerstone3D API in `annotationManager.ts`
- Advanced features like grouping annotations need further implementation
- API integration for saving/loading annotations may require backend adjustments

## How to Use the Annotation System

### Basic Usage

1. **Add the AnnotationToolbar to your view**:
   ```jsx
   <AnnotationToolbar 
     toolGroupId="myToolGroup" 
     studyId="studyId" 
     userId="userId" 
   />
   ```

2. **Connect a viewport to the tool group**:
   ```jsx
   <DicomViewer3D 
     viewportOptions={{
       viewportId: 'myViewport',
       renderingEngineId: 'myEngine',
       viewportType: 'ORTHOGRAPHIC',
       orientation: 'AXIAL'
     }}
     toolGroupId="myToolGroup"
   />
   ```

3. **Add the AnnotationManager for advanced management**:
   ```jsx
   <AnnotationManager
     toolGroupId="myToolGroup"
     studyId="studyId"
     userId="userId"
   />
   ```

### Example Component

For convenience, an `AnnotationTest` component is provided that integrates all necessary parts for testing annotation functionality:

```jsx
// Import the component
import { AnnotationTest } from '@/components/AnnotationTest';

// Use in your application
function MyPage() {
  return (
    <div className="container">
      <AnnotationTest />
    </div>
  );
}
```

### Testing Annotation Functionality

1. Open the `AnnotationTest` component
2. Select an annotation tool from the toolbar (e.g., Distance, Rectangle ROI)
3. Draw annotations on the DICOM viewer
4. Verify that the annotations appear and are tracked
5. Test the annotation manager by clicking "Manage"
6. Save annotations when finished

## Troubleshooting

If annotations are not appearing:
- Ensure the viewport and tool group IDs match between the toolbar and viewer
- Check the console for any errors related to Cornerstone3D or annotation APIs
- Verify that the Cornerstone3D tools are properly initialized

## Future Enhancements

Planned enhancements for the annotation system:
1. Improved UI for the annotation manager
2. Better organization and grouping of annotations
3. Enhanced metadata for annotations
4. AI integration for automatic measurements
5. Advanced annotation features (calibration, templating, etc.)

## API Reference

### AnnotationToolbar Props
- `toolGroupId`: String - ID of the tool group to control
- `className`: String - Optional CSS class for styling
- `onToolChange`: Function - Callback when tool selection changes
- `studyId`: String - ID of the current study for saving annotations
- `userId`: String - ID of the current user for attribution
- `onShowAnnotationManager`: Function - Callback to show the annotation manager

### AnnotationManager Props
- `toolGroupId`: String - ID of the tool group to manage
- `studyId`: String - ID of the study for loading/saving annotations
- `userId`: String - ID of the user for attribution
- `className`: String - Optional CSS class for styling
- `onAnnotationSelected`: Function - Callback when an annotation is selected 