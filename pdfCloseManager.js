export function injectCloseButtons(pdfLibrary, getCurrentPdf, clearViewerCallback, saveLibrary, refreshList, getSearchTerm) {
  const pdfList = document.getElementById('pdfList');

  pdfList.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.classList.contains('close-btn')) {
      const filePath = target.dataset.path;
      if (!filePath) return;

      const index = pdfLibrary.findIndex(item => item.path === filePath);
      if (index === -1) return;

      const isCurrentOpen = getCurrentPdf()?.filePath === filePath;

      // Remove from library
      pdfLibrary.splice(index, 1);
      await saveLibrary(pdfLibrary);

      if (isCurrentOpen) {
        clearViewerCallback(null);
      }

      refreshList(getSearchTerm());
    }
  });
}

export function createListItemWithClose(file) {
  const listItem = document.createElement('li');
  listItem.dataset.path = file.path;

  const nameSpan = document.createElement('span');
  nameSpan.textContent = file.name;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.classList.add('close-btn');
  closeBtn.dataset.path = file.path;

  listItem.appendChild(nameSpan);
  listItem.appendChild(closeBtn);

  return listItem;
}
