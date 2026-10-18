'use strict';
(() => {
  const { auth, files: cloud } = window.NaraMicrosoft.create();
  const dialog = byId('microsoftDialog'), list = byId('msFileList');
  let mode = 'open', provider = 'onedrive', folder = null, parents = [], nextLink = null;
  let listingId = 0, busy = false, selected = null, restoring = true;
  const isCloud = () => browserFiles.handle?.storageKind === 'microsoft';
  function message(value, error = false) {
    byId('msMessage').textContent = value; byId('msMessage').classList.toggle('ms-error', error);
  }
  function controls() {
    const connected = Boolean(auth.account);
    byId('msWelcome').hidden = connected; byId('msBrowser').hidden = !connected;
    byId('msAccount').textContent = auth.account?.username || '';
    byId('connectMicrosoft').textContent = restoring ? 'Recuperando Microsoft…' : connected ? 'Microsoft conectado' : 'Conectar Microsoft';
    byId('connectMicrosoft').disabled = restoring;
    for (const key of ['msConnect','msSwitch','msDisconnect','msOneDrive','msSharePointTab','msSiteOpen','msFileName']) byId(key).disabled = busy;
    byId('msClose').disabled = byId('msCancel').disabled = saving;
    byId('msUp').disabled = busy || !parents.length;
    byId('msMore').hidden = !nextLink; byId('msMore').disabled = busy;
    byId('msSave').hidden = !connected || mode !== 'save';
    byId('msSave').disabled = busy || !folder || !byId('msFileName').value.trim();
    byId('msOpen').hidden = !connected || mode !== 'open';
    byId('msOpen').disabled = busy || !selected;
    byId('msSaveFields').hidden = mode !== 'save';
    byId('msSharePointTab').hidden = auth.account?.tenantId === '9188040d-6c67-4c5b-b112-36a304b66dad';
    byId('msOneDrive').setAttribute('aria-pressed', String(provider === 'onedrive'));
    byId('msSharePointTab').setAttribute('aria-pressed', String(provider === 'sharepoint'));
    byId('msSiteForm').hidden = provider !== 'sharepoint';
    list.setAttribute('aria-busy', String(busy));
    for (const button of list.querySelectorAll('button')) button.disabled = busy || (mode === 'save' && button.dataset.kind === 'file');
  }
  async function run(action, pending = 'Cargando…') {
    if (busy) return; busy = true; controls(); message(pending);
    try { await action(); }
    catch (error) { message(error.errorCode === 'user_cancelled' ? 'Conexión cancelada.' : error.message, true); }
    finally { busy = false; controls(); }
  }
  function reset() {
    listingId++; folder = null; parents = []; nextLink = null; selected = null;
    list.replaceChildren(); byId('msPath').replaceChildren();
  }
  function detachCloud() {
    if (!isCloud()) return;
    browserFiles.handle = null; browserFiles.hash = null;
    browserFileContext(browserFiles.name); setDirty(true);
    status('La conexión al archivo se cerró. El diagrama sigue abierto como copia sin guardar.');
  }
  function open(which = 'open') {
    if (restoring) return status('Espera a que termine la recuperación de Microsoft.');
    if (busy || saving || loadingDiagram || filePolling || !ready) return status('Espera a que termine la operación del archivo.');
    if (window.NaraPropertyDraftPending()) return status('Aplica o descarta el texto de Propiedades antes de abrir Microsoft.');
    reset(); mode = which; provider = 'onedrive';
    byId('msFileName').value = browserFiles.name;
    byId('msHeading').textContent = which === 'save' ? 'Guardar en Microsoft' : 'Abrir desde Microsoft';
    byId('msAccountMenu').open = false;
    window.NaraMicrosoftDialogOpen = true; controls(); dialog.showModal();
    message('');
    if (auth.account) run(oneDrive);
    else byId('msConnect').focus();
  }
  function close() { if (!saving) dialog.close(); }
  function crumbs() {
    const path = byId('msPath'); path.replaceChildren();
    const chain = [...parents, folder].filter(Boolean);
    chain.forEach((item, index) => {
      if (index) { const slash = document.createElement('span'); slash.textContent = '/'; slash.setAttribute('aria-hidden','true'); path.append(slash); }
      const current = index === chain.length - 1;
      const node = document.createElement(current ? 'span' : 'button'); node.textContent = item.name;
      if (current) node.setAttribute('aria-current','location');
      else node.onclick = () => { if (!busy) run(() => showFolder(item, { trail: chain.slice(0,index) })); };
      path.append(node);
    });
  }
  function row(item, kind, action) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ms-file'; button.dataset.kind = kind;
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.classList.add('ms-file-icon'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','21'); icon.setAttribute('height','21'); icon.setAttribute('aria-hidden','true');
    const outline = document.createElementNS('http://www.w3.org/2000/svg','path'); outline.setAttribute('d',kind === 'folder' ? 'M3 7V5h7l2 3h9v12H3V7Z' : 'M6 3h8l5 5v13H6V3Zm8 0v6h5M9 13h7M9 17h7'); outline.setAttribute('fill','none'); outline.setAttribute('stroke','currentColor'); outline.setAttribute('stroke-width','1.5'); outline.setAttribute('stroke-linejoin','round'); icon.append(outline);
    const name = document.createElement('span'); name.textContent = item.name;
    const type = document.createElement('small'); type.textContent = kind === 'folder' ? 'Carpeta' : 'BPMN';
    button.append(icon,name,type); list.append(button);
    if (kind === 'folder') button.onclick = () => run(action);
    else {
      button.setAttribute('aria-pressed','false');
      button.onclick = () => {
        if (busy) return; selected = item;
        for (const node of list.querySelectorAll('[aria-pressed]')) node.setAttribute('aria-pressed',String(node === button));
        message('Archivo seleccionado. Pulsa Abrir para continuar.'); controls();
      };
      button.ondblclick = () => run(openSelected);
    }
  }
  async function showFolder(next, { trail = folder ? [...parents, folder] : [], more = false } = {}) {
    const current = ++listingId, account = cloud.accountId();
    const result = await cloud.children(next, more ? nextLink : null);
    if (!dialog.open || current !== listingId) return;
    cloud.assertAccount(account);
    if (!more) { parents = trail; folder = next; selected = null; list.replaceChildren(); }
    nextLink = result['@odata.nextLink'] || null;
    for (const item of result.value.sort((a,b) => Number(Boolean(b.folder))-Number(Boolean(a.folder)) || a.name.localeCompare(b.name))) {
      if (item.folder) row(item, 'folder', () => showFolder({ ...item, driveId: next.driveId }));
      else if (/\.bpmn$/i.test(item.name)) row({ ...item, driveId: next.driveId }, 'file');
    }
    crumbs();
    message(list.childElementCount ? (mode === 'open' ? 'Selecciona un BPMN o abre una carpeta.' : 'Elige una carpeta y escribe el nombre de la copia.') : 'Esta carpeta no contiene archivos BPMN ni subcarpetas.');
  }
  async function oneDrive() {
    reset(); provider = 'onedrive'; controls();
    const root = await cloud.root(); root.name = 'OneDrive';
    await showFolder(root, { trail: [] });
  }
  async function connect() {
    const previous = auth.account?.homeAccountId;
    await auth.connect();
    if (previous && previous !== auth.account.homeAccountId) await detachCloud();
    byId('msAccountMenu').open = false;
    if (dialog.open) await oneDrive();
  }
  async function openSelected() {
    if (!selected || mode !== 'open') return;
    if (dirty && !confirm('Hay cambios sin guardar. ¿Abrir el archivo de Microsoft y descartar esos cambios?')) return;
    const current = listingId, account = cloud.accountId(), handle = cloud.handle(selected);
    const file = await handle.getFile(), xml = await file.text();
    if (!dialog.open || current !== listingId) return;
    cloud.assertAccount(account);
    await acceptBrowserSource({ handle, name: file.name, xml }); dialog.close();
    try { cloud.assertAccount(account); } catch (error) { detachCloud(); throw error; }
    status('BPMN abierto desde Microsoft. Guardar actualiza este archivo.');
  }
  byId('connectMicrosoft').onclick = () => open();
  byId('openMicrosoft').onclick = () => open();
  byId('saveMicrosoftAs').onclick = () => open('save');
  byId('msClose').onclick = byId('msCancel').onclick = close;
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { reset(); window.NaraMicrosoftDialogOpen = false; });
  byId('msConnect').onclick = byId('msSwitch').onclick = () => run(connect, 'Conectando con Microsoft…');
  byId('msDisconnect').onclick = () => run(async () => {
    await auth.disconnect(); reset(); byId('msAccountMenu').open = false; message('Cuenta desconectada en este navegador.');
  });
  byId('msOneDrive').onclick = () => run(oneDrive);
  byId('msSharePointTab').onclick = () => {
    if (busy) return; reset(); provider = 'sharepoint'; controls(); message('Introduce la dirección del sitio de tu equipo.'); byId('msSiteUrl').focus();
  };
  byId('msSiteForm').onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const current = ++listingId, account = cloud.accountId(), drives = await cloud.siteDrives(byId('msSiteUrl').value.trim(), { authorize: true });
      if (!dialog.open || current !== listingId) return;
      cloud.assertAccount(account); reset();
      for (const drive of drives) row(drive,'folder', async () => { const root = await cloud.root(drive.id); root.name = drive.name; await showFolder(root,{trail:[]}); });
      message(drives.length ? 'Elige una biblioteca de documentos.' : 'No se encontraron bibliotecas disponibles en este sitio.');
    }, 'Conectando con el sitio…');
  };
  byId('msUp').onclick = () => run(() => showFolder(parents.at(-1), { trail: parents.slice(0,-1) }));
  byId('msMore').onclick = () => run(() => showFolder(folder, { more: true }));
  byId('msOpen').onclick = () => run(openSelected, 'Abriendo BPMN…');
  byId('msFileName').oninput = controls;
  byId('msFileName').onkeydown = event => { if (event.key === 'Enter' && !byId('msSave').disabled) { event.preventDefault(); byId('msSave').click(); } };
  byId('msSave').onclick = () => run(async () => {
    if (!folder || mode !== 'save') return;
    if (window.NaraPropertyDraftPending()) throw new Error('Aplica los cambios de Propiedades antes de guardar.');
    saving = true; controls(); const sequence = editSequence, account = cloud.accountId();
    try {
      const { xml } = await modeler.saveXML({ format: true }); browserFiles.validate(xml);
      const handle = await cloud.create(folder, byId('msFileName').value, xml);
      cloud.assertAccount(account);
      await browserFiles.attach({ handle, name: handle.name, xml }); browserFileContext(handle.name);
      try { cloud.assertAccount(account); } catch (error) { detachCloud(); throw error; }
      if (sequence === editSequence) setDirty(false);
      byId('externalChange').hidden = true; dialog.close(); status('BPMN guardado en Microsoft · Contenido comprobado.');
    } finally { saving = false; }
  }, 'Guardando y comprobando…');
  window.NaraMicrosoftUI = { saveAs: () => open('save') };
  auth.onChange(({ previous, account, reason }) => {
    if (previous && previous !== account) detachCloud();
    reset(); controls();
    if (dialog.open && !account) message(reason === 'expired' ? 'Microsoft requiere iniciar sesión de nuevo. Tu diagrama sigue abierto.' : 'La conexión se cerró o cambió en este navegador. Tu diagrama sigue abierto.');
  });
  auth.initialized.catch(() => message('No se pudo preparar Microsoft. Conserva tu BPMN y recarga la página.',true))
    .finally(() => { restoring = false; controls(); });
  controls();
})();
