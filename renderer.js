document.addEventListener('DOMContentLoaded', async () => {
  // Configure PDF.js worker from local node_modules
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.js';

  // PDF viewer state
  let pdfLibrary = [];
  let currentPdfDocument = null;
  let currentPage = 1;
  let currentZoom = 1.0;
  
  // DOM elements
  const openButton = document.getElementById('openButton');
  const pdfList = document.getElementById('pdfList');
  const searchInput = document.getElementById('searchInput');
  const pdfViewerContainer = document.getElementById('pdfViewerContainer');
  
  const prevPageButton = document.getElementById('prevPage');
  const nextPageButton = document.getElementById('nextPage');
  const pageNumInput = document.getElementById('pageNum');
  const pageCount = document.getElementById('pageCount');
  
  const zoomInButton = document.getElementById('zoomIn');
  const zoomOutButton = document.getElementById('zoomOut');
  const zoomLevel = document.getElementById('zoomLevel');
  
  // Load PDF library on startup
  try {
    pdfLibrary = await window.electronAPI.getPdfLibrary();
    refreshPdfList();
  } catch (error) {
    console.error('Error loading library:', error);
  }
  
  // Refresh the PDF list with optional search filtering
  function refreshPdfList(searchTerm = '') {
    pdfList.innerHTML = '';
    
    const filteredLibrary = searchTerm
      ? pdfLibrary.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : pdfLibrary;
    
    filteredLibrary.forEach((item, index) => {
      const listItem = document.createElement('li');
      listItem.textContent = item.name;
      listItem.dataset.index = pdfLibrary.indexOf(item); // Store the actual index in the full library
      pdfList.appendChild(listItem);
    });
    
    if (pdfLibrary.length > 0 && !currentPdfDocument) {
      loadPdf(pdfLibrary[0].path);
      if (pdfList.children[0]) {
        pdfList.children[0].classList.add('active');
      }
    }
  }
  
  // Search functionality
  searchInput.addEventListener('input', (event) => {
    refreshPdfList(event.target.value);
  });
  
  // Add files via open dialog
  openButton.addEventListener('click', async () => {
    const files = await window.electronAPI.openFileDialog();
    if (files.length > 0) {
      addFilesToLibrary(files);
    }
  });
  
  // Add files to library and save
  async function addFilesToLibrary(files) {
    let hasNewFiles = false;
    
    for (const file of files) {
      // Check if file exists and is not already in library
      const exists = await window.electronAPI.fileExists(file.path);
      if (exists && !pdfLibrary.some(item => item.path === file.path)) {
        pdfLibrary.push(file);
        hasNewFiles = true;
      }
    }
    
    if (hasNewFiles) {
      await window.electronAPI.savePdfLibrary(pdfLibrary);
      refreshPdfList(searchInput.value);
    }
  }
  
  // Handle PDF selection from list
  pdfList.addEventListener('click', (event) => {
    if (event.target.tagName === 'LI') {
      Array.from(pdfList.children).forEach(item => {
        item.classList.remove('active');
      });
      
      event.target.classList.add('active');
      
      const index = parseInt(event.target.dataset.index);
      if (!isNaN(index) && pdfLibrary[index]) {
        loadPdf(pdfLibrary[index].path);
      }
    }
  });
  
  // Load and render a PDF file
  async function loadPdf(filePath) {
    try {
      console.log('Loading PDF:', filePath);
      
      currentPage = 1;
      pageNumInput.value = currentPage;
      
      // Read file using the exposed electronAPI
      const base64Data = await window.electronAPI.readFile(filePath);
      if (!base64Data) {
        console.error('Failed to read PDF file');
        return;
      }
      
      // Convert base64 to binary array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Load PDF document
      const loadingTask = window.pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: 'node_modules/pdfjs-dist/cmaps/',
        cMapPacked: true,
        disableFontFace: false,
        nativeImageDecoderSupport: 'display',
        useSystemFonts: true
      });
      
      loadingTask.promise.then(pdfDocument => {
        currentPdfDocument = pdfDocument;
        pageCount.textContent = `/ ${pdfDocument.numPages}`;
        renderAllPages(pdfDocument);
      }).catch(error => {
        console.error('Error loading PDF:', error);
      });
    } catch (error) {
      console.error('Error in loadPdf:', error);
    }
  }
  
  // Clear the PDF viewer
  function clearViewer() {
    pdfViewerContainer.innerHTML = '';
  }
  
  // Render all pages of the PDF (scrollable view)
  async function renderAllPages(pdfDoc) {
    clearViewer();
    
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const containerWidth = pdfViewerContainer.clientWidth - 40;
        const originalViewport = page.getViewport({ scale: 1 });
        
        // Calculate scale to fit width while respecting zoom level
        let scale = (containerWidth / originalViewport.width) * currentZoom;
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        
        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.classList.add('pdf-page');
        canvas.dataset.pageNumber = i;
        canvas.height = viewport.height * pixelRatio;
        canvas.width = viewport.width * pixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.marginBottom = '20px';
        
        const context = canvas.getContext('2d');
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        
        // Render page to canvas
        await page.render({
          canvasContext: context,
          viewport,
          enableWebGL: true,
          renderInteractiveForms: true
        }).promise;
        
        pdfViewerContainer.appendChild(canvas);
      } catch (error) {
        console.error(`Error rendering page ${i}:`, error);
      }
    }
    
    scrollToPage(currentPage);
  }
  
  // Scroll to a specific page
  function scrollToPage(pageNumber) {
    const canvas = pdfViewerContainer.querySelector(`canvas[data-page-number="${pageNumber}"]`);
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  // Page navigation
  prevPageButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      pageNumInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });
  
  nextPageButton.addEventListener('click', () => {
    if (currentPdfDocument && currentPage < currentPdfDocument.numPages) {
      currentPage++;
      pageNumInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });
  
  pageNumInput.addEventListener('change', () => {
    if (!currentPdfDocument) return;
    
    const newPage = parseInt(pageNumInput.value);
    if (!isNaN(newPage) && newPage >= 1 && newPage <= currentPdfDocument.numPages) {
      currentPage = newPage;
      scrollToPage(currentPage);
    } else {
      pageNumInput.value = currentPage;
    }
  });
  
  // Zoom controls
  zoomInButton.addEventListener('click', () => {
    currentZoom *= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    if (currentPdfDocument) {
      renderAllPages(currentPdfDocument);
    }
  });
  
  zoomOutButton.addEventListener('click', () => {
    currentZoom /= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    if (currentPdfDocument) {
      renderAllPages(currentPdfDocument);
    }
  });
  
  // Handle window resizing
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (currentPdfDocument) {
        renderAllPages(currentPdfDocument);
      }
    }, 200); // Debounce resize events
  });
});
