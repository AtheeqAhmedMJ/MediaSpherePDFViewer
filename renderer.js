import { injectCloseButtons, createListItemWithClose } from './pdfCloseManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.js';

  let pdfLibrary = [];
  let currentPdfDocument = null;
  let currentPage = 1;
  let currentZoom = 1.0;
  let isZooming = false; // Flag to disable scroll detection during zoom

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
  const bookmarkPageBtn = document.getElementById('bookmarkPageBtn');
  const bookmarkList = document.getElementById('bookmarkList');
  let bookmarks = {};

  function clearViewer() {
    pdfViewerContainer.innerHTML = '';
    // Don't set currentPdfDocument to null here
  }

  function closeViewer() {
    pdfViewerContainer.innerHTML = '';
    currentPdfDocument = null;
  }

closeAllBtn.addEventListener('click', async () => {
  if (pdfLibrary.length === 0) return;

  const confirmClose = confirm("Are you sure you want to close all open PDFs?");
  if (!confirmClose) return;

  pdfLibrary.length = 0;
  await window.electronAPI.savePdfLibrary(pdfLibrary);
  closeViewer();
  refreshPdfList(searchInput.value);
});


  try {
    pdfLibrary = await window.electronAPI.getPdfLibrary();
    bookmarks = await window.electronAPI.getBookmarks();
    refreshPdfList();
    refreshBookmarkList();
  } catch (error) {
    console.error('Error loading library or bookmarks:', error);
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
      currentZoom = 1.0;
      pageNumInput.value = currentPage;
      zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;

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
      refreshBookmarkList();
    } catch (error) {
      console.error('Error in loadPdf:', error);
    }
  }

  async function renderAllPages(pdfDoc) {
    console.log('renderAllPages started, numPages:', pdfDoc.numPages, 'currentZoom:', currentZoom);
    clearViewer();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        console.log(`Rendering page ${i}/${pdfDoc.numPages}`);
        const page = await pdfDoc.getPage(i);
        const containerWidth = pdfViewerContainer.clientWidth - 40;
        const originalViewport = page.getViewport({ scale: 1 });

        const scale = (containerWidth / originalViewport.width) * currentZoom;
        console.log(`Page ${i} - containerWidth: ${containerWidth}, originalWidth: ${originalViewport.width}, scale: ${scale}`);
        
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
        console.log(`Page ${i} rendered successfully`);
      } catch (err) {
        console.error(`Error rendering page ${i}:`, err);
      }
    }

    console.log('All pages rendered, scrolling to page:', currentPage);
    scrollToPage(currentPage);
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    console.log('renderAllPages completed');
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
    console.log('=== ZOOM IN DEBUG ===');
    console.log('Zoom in clicked, current zoom:', currentZoom);
    console.log('currentPdfDocument exists:', !!currentPdfDocument);
    console.log('currentPdfDocument.numPages:', currentPdfDocument?.numPages);
    
    currentZoom *= 1.2;
    console.log('New zoom level:', currentZoom);
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    console.log('Zoom level text updated to:', zoomLevel.textContent);
    
    if (currentPdfDocument) {
      console.log('About to render all pages with new zoom');
      isZooming = true; // Disable scroll detection
      try {
        renderAllPages(currentPdfDocument);
        console.log('renderAllPages completed successfully');
      } catch (error) {
        console.error('Error in renderAllPages:', error);
      } finally {
        isZooming = false; // Re-enable scroll detection
      }
    } else {
      console.log('No PDF document to render');
    }
    console.log('=== END ZOOM IN DEBUG ===');
  });

  zoomOutButton.addEventListener('click', () => {
    console.log('Zoom out clicked, current zoom:', currentZoom);
    currentZoom /= 1.2;
    console.log('New zoom level:', currentZoom);
    zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    console.log('Zoom level text updated to:', zoomLevel.textContent);
    if (currentPdfDocument) {
      console.log('Rendering all pages with new zoom');
      isZooming = true; // Disable scroll detection
      try {
        renderAllPages(currentPdfDocument);
        console.log('renderAllPages completed successfully');
      } catch (error) {
        console.error('Error in renderAllPages:', error);
      } finally {
        isZooming = false; // Re-enable scroll detection
      }
    } else {
      console.log('No PDF document to render');
    }
  });

  window.addEventListener('resize', () => {
    if (currentPdfDocument) {
      renderAllPages(currentPdfDocument);
    }
  });

  pdfViewerContainer.addEventListener('scroll', () => {
    if (!currentPdfDocument || isZooming) return; // Skip during zoom operations
    const canvases = Array.from(pdfViewerContainer.querySelectorAll('canvas.pdf-page'));
    let closestPage = 1;
    let minDistance = Infinity;
    const containerRect = pdfViewerContainer.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    canvases.forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      const canvasCenter = rect.top + rect.height / 2;
      const distance = Math.abs(canvasCenter - containerCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = parseInt(canvas.dataset.pageNumber);
      }
    });
    if (closestPage !== currentPage) {
      currentPage = closestPage;
      pageNumInput.value = currentPage;
    }
  });

  function refreshBookmarkList() {
    bookmarkList.innerHTML = '';
    if (!currentPdfDocument || !currentPdfDocument.filePath) return;
    const filePath = currentPdfDocument.filePath;
    const pdfBookmarks = bookmarks[filePath] || [];
    pdfBookmarks.forEach(pageNum => {
      const li = document.createElement('li');
      li.classList.add('bookmark-item');
      
      const pageText = document.createElement('span');
      pageText.textContent = `Page ${pageNum}`;
      pageText.style.cursor = 'pointer';
      pageText.addEventListener('click', () => {
        currentPage = pageNum;
        pageNumInput.value = currentPage;
        scrollToPage(currentPage);
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.classList.add('bookmark-delete-btn');
      deleteBtn.style.marginLeft = '10px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = bookmarks[filePath].indexOf(pageNum);
        if (index > -1) {
          bookmarks[filePath].splice(index, 1);
          await window.electronAPI.saveBookmarks(bookmarks);
          refreshBookmarkList();
        }
      });
      
      li.appendChild(pageText);
      li.appendChild(deleteBtn);
      bookmarkList.appendChild(li);
    });
  }

  bookmarkPageBtn.addEventListener('click', async () => {
    console.log('Bookmark button clicked');
    console.log('currentPdfDocument:', currentPdfDocument);
    console.log('currentPdfDocument.filePath:', currentPdfDocument?.filePath);
    console.log('currentPage:', currentPage);
    
    if (!currentPdfDocument || !currentPdfDocument.filePath) {
      console.log('No PDF loaded or no filePath');
      return;
    }
    
    const filePath = currentPdfDocument.filePath;
    console.log('filePath:', filePath);
    
    if (!bookmarks[filePath]) bookmarks[filePath] = [];
    console.log('Current bookmarks for this file:', bookmarks[filePath]);
    
    if (!bookmarks[filePath].includes(currentPage)) {
      bookmarks[filePath].push(currentPage);
      console.log('Adding bookmark for page:', currentPage);
      console.log('Updated bookmarks:', bookmarks);
      
      const success = await window.electronAPI.saveBookmarks(bookmarks);
      console.log('Save bookmarks success:', success);
      
      if (!success) {
        alert('Failed to save bookmark. Please check logs.');
        console.error('Failed to save bookmark:', bookmarks);
      } else {
        console.log('Bookmark saved successfully');
      }
      refreshBookmarkList();
    } else {
      console.log('Bookmark already exists for page:', currentPage);
    }
  });

  // ✅ Activate close buttons
  injectCloseButtons(
    pdfLibrary,
    () => currentPdfDocument,
    () => closeViewer(),
    window.electronAPI.savePdfLibrary,
    refreshPdfList,
    () => searchInput.value
  );
});
