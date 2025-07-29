import { injectCloseButtons, createListItemWithClose } from './pdfCloseManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.js';

  let pdfLibrary = [];
  let currentPdfDocument = null;
  let currentPage = 1;
  let currentZoom = 1.0;

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

  const closeAllBtn = document.getElementById('closeAllBtn');

closeAllBtn.addEventListener('click', async () => {
  if (pdfLibrary.length === 0) return;

  const confirmClose = confirm("Are you sure you want to close all open PDFs?");
  if (!confirmClose) return;

  pdfLibrary.length = 0;
  await window.electronAPI.savePdfLibrary(pdfLibrary);
  clearViewer();
  refreshPdfList(searchInput.value);
});


  try {
    pdfLibrary = await window.electronAPI.getPdfLibrary();
    refreshPdfList();
  } catch (error) {
    console.error('Error loading library:', error);
  }

  function refreshPdfList(searchTerm = '') {
    pdfList.innerHTML = '';

    const filteredLibrary = searchTerm
      ? pdfLibrary.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : pdfLibrary;

    filteredLibrary.forEach(item => {
      const listItem = createListItemWithClose(item);
      pdfList.appendChild(listItem);
    });

    if (pdfLibrary.length > 0 && !currentPdfDocument) {
      loadPdf(pdfLibrary[0].path);
      if (pdfList.children[0]) {
        pdfList.children[0].classList.add('active');
      }
    }
  }

  searchInput.addEventListener('input', (e) => {
    refreshPdfList(e.target.value);
  });

  openButton.addEventListener('click', async () => {
    const files = await window.electronAPI.openFileDialog();
    if (files.length > 0) {
      addFilesToLibrary(files);
    }
  });

  async function addFilesToLibrary(files) {
    let hasNewFiles = false;
    for (const file of files) {
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

  pdfList.addEventListener('click', (e) => {
    const listItem = e.target.closest('li');
    if (listItem && !e.target.classList.contains('close-btn')) {
      Array.from(pdfList.children).forEach(item => item.classList.remove('active'));
      listItem.classList.add('active');

      const filePath = listItem.dataset.path;
      if (filePath) {
        loadPdf(filePath);
      }
    }
  });

  async function loadPdf(filePath) {
    try {
      currentPage = 1;
      pageNumInput.value = currentPage;

      const base64Data = await window.electronAPI.readFile(filePath);
      if (!base64Data) {
        console.error('Failed to read PDF file');
        return;
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const loadingTask = window.pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: 'node_modules/pdfjs-dist/cmaps/',
        cMapPacked: true
      });

      const pdfDocument = await loadingTask.promise;
      currentPdfDocument = pdfDocument;
      currentPdfDocument.filePath = filePath;
      pageCount.textContent = `/ ${pdfDocument.numPages}`;
      renderAllPages(pdfDocument);
    } catch (error) {
      console.error('Error in loadPdf:', error);
    }
  }

  function clearViewer() {
    pdfViewerContainer.innerHTML = '';
    currentPdfDocument = null;
  }

  async function renderAllPages(pdfDoc) {
    clearViewer();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const containerWidth = pdfViewerContainer.clientWidth - 40;
        const originalViewport = page.getViewport({ scale: 1 });

        const scale = (containerWidth / originalViewport.width) * currentZoom;
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
          viewport
        }).promise;

        pdfViewerContainer.appendChild(canvas);
      } catch (err) {
        console.error(`Error rendering page ${i}:`, err);
      }
    }

    scrollToPage(currentPage);
  }

  function scrollToPage(pageNum) {
    const canvas = pdfViewerContainer.querySelector(`canvas[data-page-number="${pageNum}"]`);
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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

  window.addEventListener('resize', () => {
    if (currentPdfDocument) {
      renderAllPages(currentPdfDocument);
    }
  });

  // ✅ Activate close buttons
  injectCloseButtons(
    pdfLibrary,
    () => currentPdfDocument,
    () => clearViewer(),
    window.electronAPI.savePdfLibrary,
    refreshPdfList,
    () => searchInput.value
  );
});
