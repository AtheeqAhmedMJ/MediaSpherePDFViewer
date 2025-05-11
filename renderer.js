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
  const pdfCanvas = document.getElementById('pdfCanvas'); // still retained if needed
  const ctx = pdfCanvas.getContext('2d');

  const prevPageButton = document.getElementById('prevPage');
  const nextPageButton = document.getElementById('nextPage');
  const pageNumInput = document.getElementById('pageNum');
  const pageCount = document.getElementById('pageCount');

  const zoomInButton = document.getElementById('zoomIn');
  const zoomOutButton = document.getElementById('zoomOut');
  const zoomLevel = document.getElementById('zoomLevel');

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

    if (pdfLibrary.length > 0 && !currentPdfDocument) {
      loadPdf(pdfLibrary[0].path);
      pdfList.children[0].classList.add('active');
    }
  }

  refreshPdfList();

  searchInput.addEventListener('input', (event) => {
    refreshPdfList(event.target.value);
  });

  addButton.addEventListener('click', () => {
    if (fileInput.files.length > 0) {
      for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        const filePath = file.path;

        if (!pdfLibrary.some(item => item.path === filePath)) {
          pdfLibrary.push({
            name: file.name,
            path: filePath
          });
        }
      }

      try {
        localStorage.setItem('pdfLibrary', JSON.stringify(pdfLibrary));
      } catch (error) {
        console.error('Error saving library:', error);
      }

      refreshPdfList(searchInput.value);
      fileInput.value = '';
    }
  });

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

  async function loadPdf(filePath) {
    try {
      console.log('Loading PDF:', filePath);

      currentPage = 1;
      pageNumInput.value = currentPage;

      const base64Data = await ipcRenderer.invoke('read-file', filePath);
      if (!base64Data) {
        console.error('Failed to read PDF file');
        return;
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

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
        renderAllPages(pdfDocument);
      }).catch(error => {
        console.error('Error loading PDF:', error);
      });
    } catch (error) {
      console.error('Error in loadPdf:', error);
    }
  }

  function clearViewer() {
    const container = document.getElementById('pdfViewerContainer');
    container.innerHTML = '';
  }

  async function renderAllPages(pdfDoc) {
    clearViewer();
    const container = document.getElementById('pdfViewerContainer');

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const containerWidth = container.clientWidth - 40;
      const originalViewport = page.getViewport({ scale: 1 });
      let scale = (containerWidth / originalViewport.width) * currentZoom;
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });

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

      await page.render({
        canvasContext: context,
        viewport,
        enableWebGL: true,
        renderInteractiveForms: true
      }).promise;

      container.appendChild(canvas);
    }

    scrollToPage(currentPage);
  }

  function scrollToPage(pageNumber) {
    const canvas = document.querySelector(`canvas[data-page-number="${pageNumber}"]`);
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  prevPageButton.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      pageNumInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });

  nextPageButton.addEventListener('click', () => {
    if (currentPdfDocument && currentPage < currentPdfDocument.numPages) {
      currentPage += 1;
      pageNumInput.value = currentPage;
      scrollToPage(currentPage);
    }
  });

  pageNumInput.addEventListener('change', () => {
    const newPage = parseInt(pageNumInput.value);
    if (currentPdfDocument && !isNaN(newPage) && newPage >= 1 && newPage <= currentPdfDocument.numPages) {
      currentPage = newPage;
      scrollToPage(currentPage);
    } else {
      pageNumInput.value = currentPage;
    }
  });

  zoomInButton.addEventListener('click', () => {
    currentZoom *= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    renderAllPages(currentPdfDocument);
  });

  zoomOutButton.addEventListener('click', () => {
    currentZoom /= 1.2;
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    renderAllPages(currentPdfDocument);
  });

  window.addEventListener('resize', () => {
    if (currentPdfDocument) {
      renderAllPages(currentPdfDocument);
    }
  });
});
