const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const pdfjsLib = window.pdfjsLib;

// Configure PDF.js worker and settings
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Increase default rendering quality
const CMAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/cmaps/';
const CMAP_PACKED = true;

// Disable font rendering issues
const DISABLE_FONT_FACE = false;

// Store PDF file paths
let pdfLibrary = [];
let currentPdfDocument = null;
let currentPage = 1;
let currentZoom = 1.0;

// Attempt to load library from local storage
try {
  const savedLibrary = localStorage.getItem('pdfLibrary');
  if (savedLibrary) {
    const parsedLibrary = JSON.parse(savedLibrary);
    // Verify files still exist before adding to library
    pdfLibrary = parsedLibrary.filter(item => fs.existsSync(item.path));
  }
} catch (error) {
  console.error('Error loading saved library:', error);
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const addButton = document.getElementById('addButton');
  const pdfList = document.getElementById('pdfList');
  const searchInput = document.getElementById('searchInput');
  const pdfCanvas = document.getElementById('pdfCanvas');
  const ctx = pdfCanvas.getContext('2d');
  
  // Page navigation elements
  const prevPageButton = document.getElementById('prevPage');
  const nextPageButton = document.getElementById('nextPage');
  const pageNumInput = document.getElementById('pageNum');
  const pageCount = document.getElementById('pageCount');
  
  // Zoom elements
  const zoomInButton = document.getElementById('zoomIn');
  const zoomOutButton = document.getElementById('zoomOut');
  const zoomLevel = document.getElementById('zoomLevel');
  
  // Populate the PDF list from the library
  function refreshPdfList(searchTerm = '') {
    pdfList.innerHTML = '';
    
    const filteredLibrary = searchTerm 
      ? pdfLibrary.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : pdfLibrary;
    
    filteredLibrary.forEach((item, index) => {
      const listItem = document.createElement('li');
      listItem.textContent = item.name;
      listItem.dataset.index = index;
      pdfList.appendChild(listItem);
    });
    
    // Load the first PDF automatically if library was just populated
    if (pdfLibrary.length > 0 && !currentPdfDocument) {
      loadPdf(pdfLibrary[0].path);
      pdfList.children[0].classList.add('active');
    }
  }
  
  // Initialize the list
  refreshPdfList();
  
  // Add event listener for the search input
  searchInput.addEventListener('input', (event) => {
    refreshPdfList(event.target.value);
  });
  
  // Add event listener for the Add button
  addButton.addEventListener('click', () => {
    if (fileInput.files.length > 0) {
      for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        const filePath = file.path;
        
        // Check if PDF already exists in library
        if (!pdfLibrary.some(item => item.path === filePath)) {
          // Add to the library array
          pdfLibrary.push({
            name: file.name,
            path: filePath
          });
        }
      }
      
      // Save library to local storage
      try {
        localStorage.setItem('pdfLibrary', JSON.stringify(pdfLibrary));
      } catch (error) {
        console.error('Error saving library:', error);
      }
      
      // Refresh the list
      refreshPdfList(searchInput.value);
      
      // Clear the file input
      fileInput.value = '';
    }
  });
  
  // Add event listener for PDF list items
  pdfList.addEventListener('click', (event) => {
    if (event.target.tagName === 'LI') {
      // Remove active class from all items
      Array.from(pdfList.children).forEach(item => {
        item.classList.remove('active');
      });
      
      // Add active class to clicked item
      event.target.classList.add('active');
      
      const index = parseInt(event.target.dataset.index);
      if (!isNaN(index) && pdfLibrary[index]) {
        loadPdf(pdfLibrary[index].path);
      }
    }
  });
  
  // Function to load a PDF file
  async function loadPdf(filePath) {
    try {
      console.log('Loading PDF:', filePath);
      
      // Reset the current page
      currentPage = 1;
      pageNumInput.value = currentPage;
      
      // Get the PDF file data
      const base64Data = await ipcRenderer.invoke('read-file', filePath);
      if (!base64Data) {
        console.error('Failed to read PDF file');
        return;
      }
      
      // Convert base64 to array buffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Load the PDF document with improved rendering options
      const loadingTask = pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        disableFontFace: DISABLE_FONT_FACE,
        nativeImageDecoderSupport: 'display',
        useSystemFonts: true
      });
      
      loadingTask.promise.then(pdfDocument => {
        currentPdfDocument = pdfDocument;
        pageCount.textContent = `/ ${pdfDocument.numPages}`;
        
        // Render the first page
        renderPage(currentPage);
      }).catch(error => {
        console.error('Error loading PDF:', error);
      });
    } catch (error) {
      console.error('Error in loadPdf:', error);
    }
  }
  
  // Function to render a specific page
  async function renderPage(pageNumber) {
    if (!currentPdfDocument) return;
    
    try {
      const page = await currentPdfDocument.getPage(pageNumber);
      
      // Get viewport (scale to fit width of container)
      const viewerContainer = document.getElementById('pdfViewerContainer');
      const containerWidth = viewerContainer.clientWidth - 40; // Subtract padding
      
      const originalViewport = page.getViewport({ scale: 1 });
      let scale = (containerWidth / originalViewport.width) * currentZoom;
      
      // Calculate device pixel ratio for high DPI displays
      const pixelRatio = window.devicePixelRatio || 1;
      
      // Create viewport with scale adjusted for device pixel ratio
      const viewport = page.getViewport({ scale: scale });
      
      // Set canvas dimensions accounting for device pixel ratio
      pdfCanvas.height = viewport.height * pixelRatio;
      pdfCanvas.width = viewport.width * pixelRatio;
      
      // Scale canvas CSS dimensions to match viewport
      pdfCanvas.style.width = `${viewport.width}px`;
      pdfCanvas.style.height = `${viewport.height}px`;
      
      // Scale the context to account for the device pixel ratio
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      
      // Render PDF page into canvas context with improved options
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        enableWebGL: true,
        renderInteractiveForms: true
      };
      
      await page.render(renderContext).promise;
      
      // Update current page and input value
      currentPage = pageNumber;
      pageNumInput.value = pageNumber;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  }
  
  // Event listeners for page navigation
  prevPageButton.addEventListener('click', () => {
    if (currentPage > 1) {
      renderPage(currentPage - 1);
    }
  });
  
  nextPageButton.addEventListener('click', () => {
    if (currentPdfDocument && currentPage < currentPdfDocument.numPages) {
      renderPage(currentPage + 1);
    }
  });
  
  pageNumInput.addEventListener('change', () => {
    const newPage = parseInt(pageNumInput.value);
    if (currentPdfDocument && !isNaN(newPage) && newPage >= 1 && newPage <= currentPdfDocument.numPages) {
      renderPage(newPage);
    } else {
      pageNumInput.value = currentPage;
    }
  });
  
  // Event listeners for zoom controls
  zoomInButton.addEventListener('click', () => {
    currentZoom *= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    renderPage(currentPage);
  });
  
  zoomOutButton.addEventListener('click', () => {
    currentZoom /= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    renderPage(currentPage);
  });
  
  // Handle window resize to adjust PDF rendering
  window.addEventListener('resize', () => {
    if (currentPdfDocument) {
      renderPage(currentPage);
    }
  });
});