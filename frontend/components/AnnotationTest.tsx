"use client";

import React, { useState, useEffect } from 'react';
import { DicomViewer3D } from './DicomViewer3D';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnnotationManager } from './AnnotationManager';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function AnnotationTest() {
  const toolGroupId = 'annotationTestToolGroup';
  const studyId = 'test-study-1';
  const userId = 'test-user-1';
  
  const [showAnnotationManager, setShowAnnotationManager] = useState(false);
  
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Annotation Test</h1>
        <p className="text-muted-foreground">
          Test the annotation tools by creating measurements on the DICOM viewer
        </p>
      </div>
      
      <div className="flex flex-1 gap-4">
        {/* Main Viewport Area */}
        <div className="flex-1 relative border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
          <DicomViewer3D 
            toolGroupId={toolGroupId}
            viewportOptions={{
              viewportId: 'annotationTestViewport',
              renderingEngineId: 'annotationTestEngine',
              viewportType: 'ORTHOGRAPHIC',
              orientation: 'AXIAL'
            }}
          />
        </div>
        
        {/* Sidebar with Tools */}
        <div className="w-64 flex flex-col gap-4">
          <AnnotationToolbar
            toolGroupId={toolGroupId}
            studyId={studyId}
            userId={userId}
            onShowAnnotationManager={() => setShowAnnotationManager(true)}
          />
          
          <Card>
            <CardBody>
              <div className="font-medium mb-2">Instructions</div>
              <ol className="pl-4 space-y-2 text-sm">
                <li>Select an annotation tool from the toolbar</li>
                <li>Draw annotations on the viewport</li>
                <li>Click "Manage" to open the annotation manager</li>
                <li>Save annotations when finished</li>
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
      
      {/* Annotation Manager Modal */}
      {showAnnotationManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Annotation Manager</h2>
              <Button 
                variant="ghost"
                onClick={() => setShowAnnotationManager(false)}
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              <AnnotationManager
                toolGroupId={toolGroupId}
                studyId={studyId}
                userId={userId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 