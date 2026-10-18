/* ==========================================================================
   Tareas y notas — lógica
   Cada sección guarda un array en localStorage y lo dibuja con render*().
   ========================================================================== */

// Cada usuario tiene sus propias claves: "tareas:correo" y "notas:correo"
let CLAVE_TAREAS = "tareas";
let CLAVE_NOTAS = "notas";
const CLAVE_PESTANA = "pestana-activa";
const DURACION_SALIDA = 280; // ms, igual que la transición .saliendo del CSS
const $ = (selector) => document.querySelector(selector);

/* ---------- Utilidades ---------- */

function leerLista(clave) {
  try {
    const datos = JSON.parse(localStorage.getItem(clave));
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function calcularSiguienteId(lista) {
  return Math.max(0, ...lista.map((item) => item.id ?? 0)) + 1;
}

// Anima la salida y ejecuta alTerminar. Fija la altura real antes de
// colapsar para que sea suave sin importar cuánto texto tenga.
function animarSalida(elemento, alTerminar) {
  elemento.style.maxHeight = elemento.offsetHeight + "px";
  void elemento.offsetHeight;
  elemento.classList.add("saliendo");
  elemento.style.maxHeight = "0px";
  setTimeout(alTerminar, DURACION_SALIDA);
}

function mostrarError(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.hidden = !mensaje;
}

let temporizadorToast;
function mostrarToast(mensaje, alDeshacer) {
  const toast = $("#toast");
  toast.innerHTML = "";
  const texto = document.createElement("span");
  texto.textContent = mensaje;
  toast.append(texto);

  if (alDeshacer) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = "Deshacer";
    boton.addEventListener("click", () => {
      alDeshacer();
      toast.hidden = true;
    });
    toast.append(boton);
  }

  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (toast.hidden = true), 5000);
}

// Convierte texto plano en el HTML que usa el editor (una línea = un bloque)
function textoAHtml(texto = "") {
  return texto
    .split("\n")
    .map((linea) => {
      const div = document.createElement("div");
      div.textContent = linea;
      return `<div>${div.innerHTML || "<br>"}</div>`;
    })
    .join("");
}

// Deja solo las etiquetas y atributos que el editor puede producir. Se usa al
// cargar e importar notas, para que un archivo ajeno no pueda colar código.
const ETIQUETAS_OK = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "H1", "H2", "H3", "DIV", "P", "BR", "UL", "OL", "LI", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "IMG"]);
function limpiarHtml(html = "") {
  const plantilla = document.createElement("template");
  plantilla.innerHTML = html;
  (function limpiar(nodo) {
    [...nodo.children].forEach((hijo) => {
      limpiar(hijo);
      if (!ETIQUETAS_OK.has(hijo.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(hijo.tagName)) hijo.remove();
        else hijo.replaceWith(...hijo.childNodes); // conserva el texto, quita la etiqueta
        return;
      }
      [...hijo.attributes].forEach((a) => {
        const permitido =
          (hijo.tagName === "IMG" && a.name === "src" && /^data:image\//i.test(a.value)) ||
          (hijo.tagName === "IMG" && a.name === "width" && /^\d{2,4}$/.test(a.value)) ||
          (a.name === "class" && /^(check|hecho|img-izq|img-centro|img-der|flota-izq|flota-der)( (check|hecho|img-izq|img-centro|img-der|flota-izq|flota-der))*$/.test(a.value));
        if (!permitido) hijo.removeAttribute(a.name);
      });
      if (hijo.tagName === "IMG" && !hijo.getAttribute("src")) hijo.remove();
    });
  })(plantilla.content);
  return plantilla.innerHTML;
}

const formatoFecha = (valor, opciones) => new Date(valor).toLocaleDateString("es-CO", opciones);

/* ==========================================================================
   Pestañas
   ========================================================================== */

const segmentado = document.querySelector(".segmentado");
const pestanas = document.querySelectorAll(".pestana");
const paneles = { tareas: $("#panel-tareas"), notas: $("#panel-notas") };
let vistaDividida = false; // true = Tareas y Notas se ven a la vez, cada una en su tarjeta

function activarPestana(nombre) {
  segmentado.dataset.activa = nombre;
  pestanas.forEach((pestana) => {
    const activa = pestana.dataset.pestana === nombre;
    pestana.setAttribute("aria-selected", activa);
    pestana.tabIndex = activa ? 0 : -1;
  });
  Object.entries(paneles).forEach(([clave, panel]) => (panel.hidden = !vistaDividida && clave !== nombre));
  localStorage.setItem(CLAVE_PESTANA, nombre);
}

pestanas.forEach((pestana) => {
  pestana.addEventListener("click", () => activarPestana(pestana.dataset.pestana));
  pestana.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const otra = pestana.dataset.pestana === "tareas" ? "notas" : "tareas";
    activarPestana(otra);
    $(`#pestana-${otra}`).focus();
  });
});

/* ==========================================================================
   TAREAS — { id, texto, completada, fecha }
   ========================================================================== */

const formTarea = $("#form-tarea");
const inputTarea = $("#input-tarea");
const inputFecha = $("#input-fecha");
const listaTareas = $("#lista-tareas");
const vaciaTareas = $("#vacia-tareas");
const contador = $("#contador");
const btnBorrarCompletadas = $("#btn-borrar-completadas");

let tareas = [];
let siguienteIdTarea = 1;

let filtro = "todas";
let idTareaNueva = null;

const guardarTareas = () => localStorage.setItem(CLAVE_TAREAS, JSON.stringify(tareas));
const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

function actualizarResumen() {
  const pendientes = tareas.filter((t) => !t.completada).length;
  contador.textContent = tareas.length
    ? `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`
    : "";
  btnBorrarCompletadas.hidden = !tareas.some((t) => t.completada);
}

function renderizarTareas() {
  listaTareas.innerHTML = "";

  const visibles = tareas.filter((t) =>
    filtro === "pendientes" ? !t.completada : filtro === "completadas" ? t.completada : true
  );

  visibles.forEach((tarea) => {
    const li = document.createElement("li");
    li.classList.add("tarea");
    li.dataset.id = tarea.id;
    if (tarea.completada) li.classList.add("completada");
    if (tarea.id === idTareaNueva) li.classList.add("nueva");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("checkbox-tarea");
    checkbox.checked = tarea.completada;
    checkbox.setAttribute("aria-label", "Marcar como completada");

    const cuerpo = document.createElement("div");
    cuerpo.classList.add("cuerpo-tarea");

    const spanTexto = document.createElement("span");
    spanTexto.classList.add("texto-tarea");
    spanTexto.textContent = tarea.texto;
    spanTexto.title = "Doble clic para editar";
    cuerpo.append(spanTexto);

    if (tarea.fecha) {
      const fecha = document.createElement("span");
      fecha.classList.add("fecha-tarea");
      const vencida = !tarea.completada && tarea.fecha < hoy();
      if (vencida) fecha.classList.add("vencida");
      fecha.textContent =
        (vencida ? "Venció el " : "Para el ") +
        formatoFecha(tarea.fecha + "T00:00", { day: "numeric", month: "short" });
      cuerpo.append(fecha);
    }

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.classList.add("btn-eliminar");
    btnEliminar.textContent = "Eliminar";

    li.append(checkbox, cuerpo, btnEliminar);
    listaTareas.appendChild(li);
  });

  idTareaNueva = null;

  actualizarResumen();
  vaciaTareas.hidden = visibles.length > 0;
  vaciaTareas.textContent = tareas.length
    ? "No hay tareas en este filtro."
    : "No tienes tareas pendientes.";
}

formTarea.addEventListener("submit", (event) => {
  event.preventDefault();
  const texto = inputTarea.value.trim();
  const errorTarea = $("#error-tarea");

  if (texto === "") {
    mostrarError(errorTarea, "Escribe una tarea antes de agregar.");
    inputTarea.focus();
    return;
  }
  mostrarError(errorTarea, "");

  const nueva = { id: siguienteIdTarea++, texto, completada: false, fecha: inputFecha.value || null };
  tareas.push(nueva);
  idTareaNueva = nueva.id;
  guardarTareas();
  renderizarTareas();
  formTarea.reset();
  elegirFecha(""); // el campo oculto no se limpia con reset()
  inputTarea.focus();
});

inputTarea.addEventListener("input", () => mostrarError($("#error-tarea"), ""));

// Marcar / desmarcar: solo se reasigna la clase "completada"; el CSS
// se encarga del tachado y la animación.
listaTareas.addEventListener("change", (event) => {
  if (!event.target.classList.contains("checkbox-tarea")) return;
  const li = event.target.closest(".tarea");
  const tarea = tareas.find((t) => t.id === Number(li.dataset.id));
  tarea.completada = event.target.checked;
  li.classList.toggle("completada", tarea.completada);
  guardarTareas();
  actualizarResumen();
  // Con un filtro activo, la tarea sale de la vista una vez termina la animación
  if (filtro !== "todas") setTimeout(renderizarTareas, 350);
});

listaTareas.addEventListener("click", (event) => {
  if (!event.target.classList.contains("btn-eliminar")) return;
  const li = event.target.closest(".tarea");
  const id = Number(li.dataset.id);

  animarSalida(li, () => {
    const indice = tareas.findIndex((t) => t.id === id);
    const [borrada] = tareas.splice(indice, 1);
    guardarTareas();
    renderizarTareas();
    mostrarToast("Tarea eliminada", () => {
      tareas.splice(indice, 0, borrada);
      guardarTareas();
      renderizarTareas();
    });
  });
});

// Editar el texto con doble clic: Enter guarda, Escape cancela
listaTareas.addEventListener("dblclick", (event) => {
  const span = event.target.closest(".texto-tarea");
  if (!span) return;
  const tarea = tareas.find((t) => t.id === Number(span.closest(".tarea").dataset.id));

  const campo = document.createElement("input");
  campo.className = "campo campo-inline";
  campo.value = tarea.texto;
  span.replaceWith(campo);
  campo.focus();
  campo.select();

  let terminado = false;
  const terminar = (guardar) => {
    if (terminado) return;
    terminado = true;
    const nuevo = campo.value.trim();
    if (guardar && nuevo) tarea.texto = nuevo;
    guardarTareas();
    renderizarTareas();
  };
  campo.addEventListener("blur", () => terminar(true));
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") terminar(true);
    if (e.key === "Escape") terminar(false);
  });
});

document.querySelectorAll(".filtro").forEach((boton) => {
  boton.addEventListener("click", () => {
    filtro = boton.dataset.filtro;
    document.querySelectorAll(".filtro").forEach((b) =>
      b.setAttribute("aria-pressed", b === boton)
    );
    renderizarTareas();
  });
});

btnBorrarCompletadas.addEventListener("click", () => {
  const antes = [...tareas];
  tareas = tareas.filter((t) => !t.completada);
  guardarTareas();
  renderizarTareas();
  mostrarToast("Tareas completadas borradas", () => {
    tareas = antes;
    guardarTareas();
    renderizarTareas();
  });
});

/* ==========================================================================
   Calendario propio para la fecha límite
   El valor vive en #input-fecha (oculto) con formato AAAA-MM-DD.
   ========================================================================== */

const btnFecha = $("#btn-fecha");
const textoFecha = $("#texto-fecha");
const calendario = $("#calendario");
const selectorFecha = $(".selector-fecha");
let mesVista = new Date();

function elegirFecha(valor) {
  inputFecha.value = valor;
  textoFecha.textContent = valor ? formatoFecha(valor + "T00:00", { day: "numeric", month: "short" }) : "Fecha";
  btnFecha.classList.toggle("con-valor", Boolean(valor));
}

function dibujarCalendario() {
  const año = mesVista.getFullYear();
  const mes = mesVista.getMonth();
  const titulo = mesVista.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const huecos = (new Date(año, mes, 1).getDay() + 6) % 7; // la semana empieza en lunes
  const total = new Date(año, mes + 1, 0).getDate();

  let html = `<div class="cal-cabecera">
    <button type="button" class="cal-nav" data-accion="anterior" aria-label="Mes anterior">‹</button>
    <strong>${titulo}</strong>
    <button type="button" class="cal-nav" data-accion="siguiente" aria-label="Mes siguiente">›</button>
  </div><div class="cal-grid">`;
  html += ["L", "M", "X", "J", "V", "S", "D"].map((d) => `<span class="cal-semana">${d}</span>`).join("");
  html += "<span></span>".repeat(huecos);

  for (let dia = 1; dia <= total; dia++) {
    const fecha = `${año}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const clases = "cal-dia" + (fecha === hoy() ? " hoy" : "") + (fecha === inputFecha.value ? " elegido" : "");
    html += `<button type="button" class="${clases}" data-fecha="${fecha}">${dia}</button>`;
  }

  html += `</div><div class="cal-pie">
    <button type="button" class="btn-texto" data-accion="quitar">Quitar fecha</button>
    <button type="button" class="btn-texto cal-hoy" data-accion="hoy">Hoy</button>
  </div>`;
  calendario.innerHTML = html;
}

function abrirCalendario(abrir) {
  calendario.hidden = !abrir;
  btnFecha.setAttribute("aria-expanded", abrir);
  // Sube su tarjeta por encima de la vecina para que el calendario no quede tapado
  selectorFecha.closest(".panel").classList.toggle("con-calendario", abrir);
  if (abrir) {
    mesVista = inputFecha.value ? new Date(inputFecha.value + "T00:00") : new Date();
    mesVista.setDate(1);
    dibujarCalendario();
  }
}

btnFecha.addEventListener("click", () => abrirCalendario(calendario.hidden));

calendario.addEventListener("click", (event) => {
  const boton = event.target.closest("button");
  if (!boton) return;
  const { fecha, accion } = boton.dataset;

  if (fecha) {
    elegirFecha(fecha);
    abrirCalendario(false);
  } else if (accion === "anterior" || accion === "siguiente") {
    mesVista.setMonth(mesVista.getMonth() + (accion === "anterior" ? -1 : 1));
    dibujarCalendario();
  } else if (accion === "hoy") {
    elegirFecha(hoy());
    abrirCalendario(false);
  } else if (accion === "quitar") {
    elegirFecha("");
    abrirCalendario(false);
  }
});

// composedPath() porque al cambiar de mes el botón pulsado ya salió del DOM
document.addEventListener("click", (event) => {
  if (!calendario.hidden && !event.composedPath().includes(selectorFecha)) abrirCalendario(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !calendario.hidden) {
    abrirCalendario(false);
    btnFecha.focus();
  }
});

/* ==========================================================================
   NOTAS — { id, titulo, contenido, creada, editada, fijada }
   ========================================================================== */

const formNota = $("#form-nota");
const inputTitulo = $("#input-titulo");
const inputContenido = $("#input-contenido");
const buscador = $("#buscador");
const contenedorNotas = $("#contenedor-notas");
const vaciaNotas = $("#vacia-notas");

let notas = [];
let siguienteIdNota = 1;
let idNotaNueva = null;

const guardarNotas = () => localStorage.setItem(CLAVE_NOTAS, JSON.stringify(notas));

function crearBoton(clase, texto) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.classList.add(clase);
  boton.textContent = texto;
  return boton;
}

function renderizarNotas() {
  contenedorNotas.innerHTML = "";
  const termino = buscador.value.trim().toLowerCase();

  // Fijadas primero; dentro de cada grupo, la más reciente arriba
  const visibles = notas
    .filter((n) => (n.titulo + " " + n.contenido).toLowerCase().includes(termino))
    .sort((a, b) => Number(b.fijada) - Number(a.fijada) || (b.editada ?? b.creada) - (a.editada ?? a.creada));

  visibles.forEach((nota) => {
    const div = document.createElement("div");
    div.classList.add("nota");
    div.dataset.id = nota.id;
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", "Abrir nota: " + nota.titulo);
    if (nota.fijada) div.classList.add("fijada");
    if (nota.id === idNotaNueva) div.classList.add("nueva");

    const h3 = document.createElement("h3");
    h3.textContent = nota.titulo;

    const p = document.createElement("p");
    p.textContent = nota.contenido || (nota.html.includes("<img") ? "Nota con imágenes" : "");
    p.hidden = !p.textContent;

    const meta = document.createElement("span");
    meta.classList.add("meta-nota");
    const cuando = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
    meta.textContent = nota.editada
      ? "Editada " + formatoFecha(nota.editada, cuando)
      : "Creada " + formatoFecha(nota.creada, cuando);

    const acciones = document.createElement("div");
    acciones.classList.add("acciones-nota");
    acciones.append(
      crearBoton("btn-fijar", nota.fijada ? "Quitar fijada" : "Fijar"),
      crearBoton("btn-eliminar", "Eliminar")
    );

    div.append(h3, p, meta, acciones);
    contenedorNotas.appendChild(div);
  });

  idNotaNueva = null;
  vaciaNotas.hidden = visibles.length > 0;
  vaciaNotas.textContent = notas.length
    ? "No hay notas que coincidan con la búsqueda."
    : "Aún no tienes notas. Escribe la primera arriba.";
}

formNota.addEventListener("submit", (event) => {
  event.preventDefault();
  const titulo = inputTitulo.value.trim();
  const contenido = inputContenido.value.trim();
  const errorNota = $("#error-nota");

  if (titulo === "") return mostrarError(errorNota, "Escribe un título para la nota.");
  if (contenido === "") return mostrarError(errorNota, "Escribe el contenido de la nota.");
  mostrarError(errorNota, "");

  const nueva = { id: siguienteIdNota++, titulo, contenido, html: textoAHtml(contenido), creada: Date.now(), fijada: false };
  notas.push(nueva);
  idNotaNueva = nueva.id;
  formNota.reset();
  guardarNotas();
  renderizarNotas();
});

[inputTitulo, inputContenido].forEach((campo) =>
  campo.addEventListener("input", () => mostrarError($("#error-nota"), ""))
);
buscador.addEventListener("input", renderizarNotas);

// Clic en la nota = abrirla; los botones Fijar y Eliminar siguen funcionando aparte
contenedorNotas.addEventListener("click", (event) => {
  const div = event.target.closest(".nota");
  if (!div) return;
  const id = Number(div.dataset.id);

  if (event.target.classList.contains("btn-fijar")) {
    const nota = notas.find((n) => n.id === id);
    nota.fijada = !nota.fijada;
    guardarNotas();
    renderizarNotas();
  } else if (event.target.classList.contains("btn-eliminar")) {
    animarSalida(div, () => {
      const indice = notas.findIndex((n) => n.id === id);
      const [borrada] = notas.splice(indice, 1);
      guardarNotas();
      renderizarNotas();
      mostrarToast("Nota eliminada", () => {
        notas.splice(indice, 0, borrada);
        guardarNotas();
        renderizarNotas();
      });
    });
  } else {
    abrirEditor(id, div);
  }
});

contenedorNotas.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.classList.contains("nota")) {
    event.preventDefault();
    abrirEditor(Number(event.target.dataset.id), event.target);
  }
});

/* ==========================================================================
   Editor de notas (estilo Apple Notes)
   La nota se expande desde su tarjeta. Formato con document.execCommand,
   imágenes reducidas a data URL y guardado automático mientras escribes.
   ========================================================================== */

const editorFondo = $("#editor-fondo");
const editor = $("#editor");
const editorTitulo = $("#editor-titulo");
const cuerpo = $("#editor-cuerpo");
const editorEstado = $("#editor-estado");
const herramientas = $(".editor-herramientas");
const grupoTabla = $("#grupo-tabla");
const archivoImagen = $("#editor-imagen");
let notaAbierta = null;
let temporizadorGuardado;
let rangoGuardado = null;

const textoPlano = () => (cuerpo.innerText ?? cuerpo.textContent).trim();

function actualizarVacio() {
  const vacio = !textoPlano() && !cuerpo.querySelector("img, table");
  cuerpo.classList.toggle("vacio", vacio);
}

function fijarOrigen(tarjetaEl) {
  const caja = editor.getBoundingClientRect();
  const t = tarjetaEl.getBoundingClientRect();
  editor.style.setProperty("--ox", `${t.left + t.width / 2 - caja.left}px`);
  editor.style.setProperty("--oy", `${t.top + t.height / 2 - caja.top}px`);
}

function abrirEditor(id, tarjetaEl) {
  notaAbierta = notas.find((n) => n.id === id);
  if (!notaAbierta) return;
  editorTitulo.value = notaAbierta.titulo;
  cuerpo.innerHTML = notaAbierta.html;
  deseleccionar();
  try { document.execCommand("enableObjectResizing", false, false); } catch {} // Firefox trae sus propios tiradores
  editorEstado.textContent = "";
  actualizarVacio();
  document.body.classList.add("editor-abierto");
  editorFondo.classList.remove("cerrando");
  editorFondo.hidden = false;
  fijarOrigen(tarjetaEl);
  editor.classList.remove("abriendo", "cerrando");
  void editor.offsetWidth;
  editor.classList.add("abriendo");
  if (!cuerpo.textContent.trim()) cuerpo.focus();
}

function guardarEditor() {
  if (!notaAbierta) return;
  clearTimeout(temporizadorGuardado);
  notaAbierta.titulo = editorTitulo.value.trim() || "Sin título";
  notaAbierta.html = limpiarHtml(cuerpo.innerHTML);
  notaAbierta.contenido = textoPlano();
  notaAbierta.editada = Date.now();
  try {
    guardarNotas();
    editorEstado.textContent = "Guardado";
  } catch {
    editorEstado.textContent = "";
    mostrarToast("No hay espacio para guardar: prueba con imágenes más pequeñas");
  }
}

function programarGuardado() {
  editorEstado.textContent = "Guardando…";
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardarEditor, 500);
  actualizarVacio();
}

function cerrarEditor() {
  if (!notaAbierta) return;
  guardarEditor();
  deseleccionar();
  const id = notaAbierta.id;
  notaAbierta = null;
  renderizarNotas(); // la tarjeta ya muestra los cambios y sirve de destino de la animación
  const tarjetaEl = [...contenedorNotas.children].find((d) => Number(d.dataset.id) === id);
  if (tarjetaEl) fijarOrigen(tarjetaEl);
  editor.classList.remove("abriendo");
  editor.classList.add("cerrando");
  editorFondo.classList.add("cerrando");
  setTimeout(() => {
    editorFondo.hidden = true;
    editor.classList.remove("cerrando");
    document.body.classList.remove("editor-abierto");
  }, 300);
}

/* ----- selección, tablas e imágenes ----- */

function restaurarRango() {
  if (!rangoGuardado) return;
  cuerpo.focus();
  const seleccion = getSelection();
  seleccion.removeAllRanges();
  seleccion.addRange(rangoGuardado);
}

function celdaActual() {
  const nodo = getSelection().anchorNode;
  if (!nodo || !cuerpo.contains(nodo)) return null;
  return (nodo.nodeType === 1 ? nodo : nodo.parentElement).closest("td, th");
}

function ponerCursor(elemento) {
  const rango = document.createRange();
  rango.selectNodeContents(elemento);
  rango.collapse(true);
  const seleccion = getSelection();
  seleccion.removeAllRanges();
  seleccion.addRange(rango);
}

function insertarTabla() {
  const fila = "<tr>" + "<td><br></td>".repeat(3) + "</tr>";
  document.execCommand("insertHTML", false, `<table><tbody>${fila.repeat(3)}</tbody></table><div><br></div>`);
}

function agregarFila() {
  const celda = celdaActual();
  if (!celda) return;
  const nueva = celda.parentElement.cloneNode(true);
  nueva.querySelectorAll("td, th").forEach((c) => (c.innerHTML = "<br>"));
  celda.parentElement.after(nueva);
}

function agregarColumna() {
  const celda = celdaActual();
  if (!celda) return;
  const indice = celda.cellIndex;
  [...celda.closest("table").rows].forEach((fila) => {
    const nueva = document.createElement("td");
    nueva.innerHTML = "<br>";
    fila.cells[indice].after(nueva);
  });
}

function quitarTabla() {
  celdaActual()?.closest("table").remove();
}

function reducirImagen(archivo, maximo = 1100) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      const ctx = lienzo.getContext("2d");
      ctx.fillStyle = "#ffffff"; // los PNG transparentes no quedan negros al pasar a JPEG
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(url);
      resolver(lienzo.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = rechazar;
    img.src = url;
  });
}

async function insertarImagen(archivo) {
  try {
    const url = await reducirImagen(archivo);
    restaurarRango();
    document.execCommand("insertImage", false, url);
    programarGuardado();
  } catch {
    mostrarToast("No se pudo insertar la imagen");
  }
}

/* ----- imágenes: seleccionar, redimensionar, alinear y mover ----- */

const zona = $(".editor-zona");
const marco = $("#img-marco");
const grupoImagen = $("#grupo-imagen");
const CLASES_IMAGEN = ["img-izq", "img-centro", "img-der", "flota-izq", "flota-der"];
let imagenSel = null;

function deseleccionar() {
  imagenSel = null;
  marco.hidden = true;
  grupoImagen.hidden = true;
}

// El marco es un elemento aparte (no forma parte del contenido guardado)
// que se dibuja encima de la imagen seleccionada.
function ubicarMarco() {
  if (!imagenSel || !cuerpo.contains(imagenSel)) return deseleccionar();
  const z = zona.getBoundingClientRect();
  const r = imagenSel.getBoundingClientRect();
  Object.assign(marco.style, {
    left: `${r.left - z.left}px`, top: `${r.top - z.top}px`, width: `${r.width}px`, height: `${r.height}px`,
  });
  marco.hidden = false;
  grupoImagen.hidden = false;
}

function alinearImagen(clase) {
  if (!imagenSel) return;
  imagenSel.classList.remove(...CLASES_IMAGEN);
  imagenSel.classList.add(clase);
  ubicarMarco();
}

// Sube o baja la imagen un bloque (alternativa al arrastre, útil en el celular)
function moverImagen(direccion) {
  if (!imagenSel || imagenSel.closest("td, th")) return;
  let bloque = imagenSel;
  while (bloque.parentElement !== cuerpo) bloque = bloque.parentElement;
  const compartido = bloque === imagenSel || bloque.textContent.trim() || bloque.querySelectorAll("img").length > 1;
  if (compartido) {
    const aparte = document.createElement("div"); // la imagen se aparta en su propio bloque
    bloque.before(aparte);
    aparte.append(imagenSel);
    bloque = aparte;
  }
  const vecino = direccion < 0 ? bloque.previousElementSibling : bloque.nextElementSibling;
  if (vecino) direccion < 0 ? vecino.before(bloque) : vecino.after(bloque);
  imagenSel.scrollIntoView?.({ block: "nearest" });
  ubicarMarco();
}

function quitarImagen() {
  imagenSel?.remove();
  deseleccionar();
}

let acabaDeArrastrar = false;

cuerpo.addEventListener("click", (event) => {
  if (acabaDeArrastrar) return;
  if (event.target.tagName === "IMG") {
    imagenSel = event.target;
    ubicarMarco();
  } else {
    deseleccionar();
  }
});

// Tiradores de las esquinas: cambian el ancho y el alto se ajusta solo (proporcional)
marco.addEventListener("pointerdown", (event) => {
  const asa = event.target.closest(".asa");
  if (!asa || !imagenSel) return;
  event.preventDefault();
  asa.setPointerCapture?.(event.pointerId);

  const inicioX = event.clientX;
  const anchoInicial = imagenSel.getBoundingClientRect().width;
  const haciaOeste = asa.dataset.esq.includes("w");
  const factor = imagenSel.classList.contains("img-centro") ? 2 : 1; // centrada: crece por ambos lados
  const maximo = cuerpo.clientWidth - 24;

  const mover = (e) => {
    const dx = (e.clientX - inicioX) * factor * (haciaOeste ? -1 : 1);
    imagenSel.setAttribute("width", Math.round(Math.max(40, Math.min(maximo, anchoInicial + dx))));
    imagenSel.removeAttribute("height");
    ubicarMarco();
  };
  const soltar = () => {
    asa.removeEventListener("pointermove", mover);
    asa.removeEventListener("pointerup", soltar);
    asa.removeEventListener("pointercancel", soltar);
    programarGuardado();
  };
  asa.addEventListener("pointermove", mover);
  asa.addEventListener("pointerup", soltar);
  asa.addEventListener("pointercancel", soltar);
});

// Mover arrastrando: arrastre propio (el nativo cambia según el navegador y falla en el
// celular). Mientras arrastras se ve una copia flotante y una línea azul que marca el
// punto de la nota donde caerá la imagen: entre dos bloques (párrafos, listas, tablas).
cuerpo.addEventListener("dragstart", (event) => {
  if (event.target.tagName === "IMG") event.preventDefault();
});

// Bloque (hijo directo del editor) más cercano a la altura y, sin contar el de la propia imagen
function bloqueDestino(y, imagen) {
  const bloques = [...cuerpo.children].filter(
    (b) => b !== imagen && !(b.contains(imagen) && !b.textContent.trim() && b.querySelectorAll("img").length === 1)
  );
  let mejor = null;
  let distanciaMejor = Infinity;
  bloques.forEach((bloque) => {
    const r = bloque.getBoundingClientRect();
    const distancia = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (distancia < distanciaMejor) {
      distanciaMejor = distancia;
      mejor = { bloque, despues: y > r.top + r.height / 2, rect: r };
    }
  });
  return mejor;
}

function soltarImagen(imagen, destino) {
  const origen = imagen.parentElement;
  const aparte = document.createElement("div");
  aparte.append(imagen);
  destino.bloque[destino.despues ? "after" : "before"](aparte);
  // Si el bloque de origen se quedó vacío, se retira
  if (origen.parentElement === cuerpo && origen.tagName === "DIV" && !origen.textContent.trim() && !origen.querySelector("img, table")) {
    origen.remove();
  }
}

cuerpo.addEventListener("pointerdown", (event) => {
  const imagen = event.target;
  if (imagen.tagName !== "IMG" || event.button !== 0) return;

  const inicio = { x: event.clientX, y: event.clientY };
  let arrastrando = false;
  let destino = null;
  let fantasma;
  let guia;

  const mover = (e) => {
    if (!arrastrando) {
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6) return; // aún es un clic
      arrastrando = true;
      marco.hidden = true;
      document.body.classList.add("arrastrando-imagen");
      fantasma = document.createElement("div");
      fantasma.className = "img-fantasma";
      fantasma.append(imagen.cloneNode());
      guia = document.createElement("div");
      guia.className = "guia-soltar";
      document.body.append(fantasma, guia);
    }

    fantasma.style.left = `${e.clientX}px`;
    fantasma.style.top = `${e.clientY}px`;

    // Desplazamiento automático al acercarse al borde del editor
    const zonaRect = cuerpo.getBoundingClientRect();
    if (e.clientY < zonaRect.top + 40) cuerpo.scrollTop -= 14;
    if (e.clientY > zonaRect.bottom - 40) cuerpo.scrollTop += 14;

    destino = bloqueDestino(e.clientY, imagen);
    guia.hidden = !destino;
    if (destino) {
      const r = destino.rect;
      guia.style.left = `${zonaRect.left + 14}px`;
      guia.style.width = `${cuerpo.clientWidth - 28}px`;
      guia.style.top = `${(destino.despues ? r.bottom : r.top) - 1.5}px`;
    }
  };

  const soltar = () => {
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", soltar);
    if (!arrastrando) return;

    fantasma.remove();
    guia.remove();
    document.body.classList.remove("arrastrando-imagen");
    acabaDeArrastrar = true; // evita que el clic posterior cambie la selección
    setTimeout(() => (acabaDeArrastrar = false), 0);

    if (destino) {
      soltarImagen(imagen, destino);
      programarGuardado();
    }
    imagenSel = imagen;
    ubicarMarco();
  };

  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
});
cuerpo.addEventListener("scroll", ubicarMarco);
window.addEventListener("resize", ubicarMarco);

/* ----- eventos ----- */

// mousedown sin quitar el foco, para no perder la selección al pulsar un botón
herramientas.addEventListener("mousedown", (event) => {
  if (event.target.closest("button")) event.preventDefault();
});

herramientas.addEventListener("click", (event) => {
  const boton = event.target.closest("button");
  if (!boton) return;
  const { cmd, bloque, accion } = boton.dataset;
  restaurarRango();

  if (cmd) document.execCommand(cmd);
  else if (bloque) document.execCommand("formatBlock", false, bloque);
  else if (accion === "check") {
    document.execCommand("insertUnorderedList");
    getSelection().anchorNode?.parentElement?.closest("ul")?.classList.toggle("check");
  } else if (accion === "tabla") insertarTabla();
  else if (accion === "imagen") archivoImagen.click();
  else if (accion === "fila") agregarFila();
  else if (accion === "columna") agregarColumna();
  else if (accion === "quitar-tabla") quitarTabla();
  else if (accion === "alinear") alinearImagen(boton.dataset.alin);
  else if (accion === "subir") moverImagen(-1);
  else if (accion === "bajar") moverImagen(1);
  else if (accion === "quitar-imagen") quitarImagen();

  programarGuardado();
  grupoTabla.hidden = !celdaActual();
  ubicarMarco();
});

archivoImagen.addEventListener("change", () => {
  const archivo = archivoImagen.files[0];
  archivoImagen.value = "";
  if (archivo) insertarImagen(archivo);
});

cuerpo.addEventListener("input", () => {
  programarGuardado();
  ubicarMarco();
});
editorTitulo.addEventListener("input", programarGuardado);

// Pegar: una imagen se inserta reducida; cualquier otra cosa entra como texto limpio
cuerpo.addEventListener("paste", (event) => {
  event.preventDefault();
  const imagen = [...event.clipboardData.files].find((f) => f.type.startsWith("image/"));
  if (imagen) insertarImagen(imagen);
  else document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
});

// Tab salta de celda en celda (y crea una fila nueva al final de la tabla)
cuerpo.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const celda = celdaActual();
  if (!celda) return;
  event.preventDefault();
  const tabla = celda.closest("table");
  let celdas = [...tabla.querySelectorAll("td, th")];
  const destino = celdas.indexOf(celda) + (event.shiftKey ? -1 : 1);
  if (destino >= celdas.length) {
    agregarFila();
    celdas = [...tabla.querySelectorAll("td, th")];
  }
  if (celdas[destino]) ponerCursor(celdas[destino]);
});

// Casillas de la lista de verificación: clic en el círculo de la izquierda
cuerpo.addEventListener("click", (event) => {
  const item = event.target;
  if (item.tagName === "LI" && item.parentElement.classList.contains("check") && event.offsetX < 30) {
    item.classList.toggle("hecho");
    programarGuardado();
  }
});

document.addEventListener("selectionchange", () => {
  const seleccion = getSelection();
  if (!seleccion.rangeCount || !cuerpo.contains(seleccion.anchorNode)) return;
  rangoGuardado = seleccion.getRangeAt(0).cloneRange();
  grupoTabla.hidden = !celdaActual();
});

$("#editor-cerrar").addEventListener("click", cerrarEditor);
$("#editor-hecho").addEventListener("click", cerrarEditor);
editorFondo.addEventListener("click", (event) => {
  if (event.target === editorFondo) cerrarEditor();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !editorFondo.hidden) cerrarEditor();
});

/* ==========================================================================
   Exportar / importar copia de seguridad (JSON)
   ========================================================================== */

$("#btn-exportar").addEventListener("click", () => {
  const datos = JSON.stringify({ tareas, notas }, null, 2);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([datos], { type: "application/json" }));
  enlace.download = `tareas-y-notas-${hoy()}.json`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
});

$("#btn-importar").addEventListener("click", () => $("#archivo-importar").click());

$("#archivo-importar").addEventListener("change", async (event) => {
  const archivo = event.target.files[0];
  event.target.value = "";
  if (!archivo) return;

  try {
    const datos = JSON.parse(await archivo.text());
    if (!Array.isArray(datos.tareas) || !Array.isArray(datos.notas)) throw new Error("formato");
    if (!confirm("Importar reemplazará tus tareas y notas actuales. ¿Continuar?")) return;

    tareas = datos.tareas;
    notas = datos.notas.map((n) => ({ ...n, html: limpiarHtml(n.html ?? textoAHtml(n.contenido ?? "")) }));
    siguienteIdTarea = calcularSiguienteId(tareas);
    siguienteIdNota = calcularSiguienteId(notas);
    guardarTareas();
    guardarNotas();
    renderizarNotas();
    renderizarTareas();
    mostrarToast("Copia importada");
  } catch {
    mostrarToast("No se pudo importar: el archivo no es una copia válida");
  }
});

/* ==========================================================================
   Tema claro / oscuro
   El tema inicial lo fija un script en el <head>; aquí solo se maneja el botón.
   ========================================================================== */

const btnTema = $("#btn-tema");
const raiz = document.documentElement;

function aplicarTema(tema, guardar = false) {
  raiz.dataset.tema = tema;
  btnTema.setAttribute("aria-pressed", tema === "oscuro");
  btnTema.setAttribute("aria-label", tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  if (guardar) localStorage.setItem("tema", tema);
}

btnTema.addEventListener("click", () => {
  raiz.classList.add("cambiando-tema");
  aplicarTema(raiz.dataset.tema === "oscuro" ? "claro" : "oscuro", true);
  setTimeout(() => raiz.classList.remove("cambiando-tema"), 400);
});

/* ==========================================================================
   Vista unida / dividida ("mitosis")
   La tarjeta única se ensancha y se divide en dos: Tareas y Notas a la vez.
   El CSS hace la animación; aquí solo se alternan las clases.
   ========================================================================== */

const tarjeta = $("#app-principal");
const contenedorPaneles = $(".paneles");
const btnDividir = $("#btn-dividir");
let temporizadorVista;

function actualizarBotonVista() {
  const texto = vistaDividida ? "Unir en una sola tarjeta" : "Separar en dos tarjetas";
  btnDividir.setAttribute("aria-pressed", vistaDividida);
  btnDividir.setAttribute("aria-label", texto);
  btnDividir.title = texto;
}

function cambiarVista(dividir, animar = true) {
  clearTimeout(temporizadorVista);
  const activa = segmentado.dataset.activa;
  const otro = paneles[activa === "tareas" ? "notas" : "tareas"];
  const lado = activa === "tareas" ? "izq" : "der"; // desde dónde "nace" la tarjeta nueva

  Object.values(paneles).forEach((p) => p.classList.remove("naciendo-izq", "naciendo-der", "muriendo"));
  vistaDividida = dividir;
  tarjeta.classList.toggle("dividida", dividir);

  if (dividir) {
    contenedorPaneles.classList.add("dos-col");
    otro.hidden = false;
    if (animar) {
      otro.classList.add(`naciendo-${lado}`);
      temporizadorVista = setTimeout(() => otro.classList.remove(`naciendo-${lado}`), 700);
    }
  } else {
    // La tarjeta sobrante se desvanece y, al terminar, se vuelve a una sola columna
    const terminar = () => {
      otro.classList.remove("muriendo");
      otro.hidden = true;
      contenedorPaneles.classList.remove("dos-col");
    };
    if (animar) {
      otro.classList.add("muriendo");
      temporizadorVista = setTimeout(terminar, 380);
    } else {
      terminar();
    }
  }

  actualizarBotonVista();
  localStorage.setItem("vista", dividir ? "dividida" : "unida");
}

btnDividir.addEventListener("click", () => cambiarVista(!vistaDividida));

/* ==========================================================================
   Cuentas: login, registro y cierre de sesión
   Todo ocurre en este navegador (localStorage), sin servidor: sirve para
   separar los datos por usuario, pero no es seguridad real.
   ========================================================================== */

const CLAVE_USUARIOS = "usuarios";
const CLAVE_SESION = "sesion";
const vistaAuth = $("#vista-auth");
const appPrincipal = $("#app-principal");
const formAuth = $("#form-auth");
const errorAuth = $("#error-auth");
let modoAuth = "login";

async function cifrar(clave, sal) {
  const bytes = new TextEncoder().encode(sal + clave);
  const resumen = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function crearSal() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cambiarModoAuth(modo) {
  modoAuth = modo;
  const registro = modo === "registro";
  $("#auth-titulo").textContent = registro ? "Crear cuenta" : "Iniciar sesión";
  $("#auth-enviar").textContent = registro ? "Registrarme" : "Iniciar sesión";
  $("#auth-pregunta").textContent = registro ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
  $("#auth-cambiar").textContent = registro ? "Iniciar sesión" : "Crear cuenta";
  $("#auth-nombre").hidden = !registro;
  $("#auth-clave").autocomplete = registro ? "new-password" : "current-password";
  mostrarError(errorAuth, "");
}

// Carga las tareas y notas del usuario y reinicia el estado de la interfaz
function cargarDatos(email) {
  CLAVE_TAREAS = `tareas:${email}`;
  CLAVE_NOTAS = `notas:${email}`;

  tareas = leerLista(CLAVE_TAREAS).map((t) =>
    typeof t === "string" ? { texto: t, completada: false } : t
  );
  siguienteIdTarea = calcularSiguienteId(tareas);
  tareas.forEach((t) => {
    if (t.id === undefined) t.id = siguienteIdTarea++;
  });

  notas = leerLista(CLAVE_NOTAS);
  notas.forEach((n) => {
    n.creada ??= Date.now();
    n.fijada ??= false;
    n.html = limpiarHtml(n.html ?? textoAHtml(n.contenido ?? ""));
  });
  siguienteIdNota = calcularSiguienteId(notas);

  filtro = "todas";
  document.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filtro === "todas"));
  buscador.value = "";
  formNota.reset();

  guardarTareas();
  guardarNotas();
  renderizarTareas();
  renderizarNotas();
}

function mostrarApp(email) {
  const usuario = leerLista(CLAVE_USUARIOS).find((u) => u.email === email);
  cargarDatos(email);
  $("#saludo").textContent = `Hola, ${usuario.nombre}`;
  vistaAuth.hidden = true;
  appPrincipal.hidden = false;
  document.body.classList.remove("auth-activa");
  formAuth.reset();
}

function cerrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
  appPrincipal.hidden = true;
  vistaAuth.hidden = false;
  document.body.classList.add("auth-activa");
  $("#toast").hidden = true;
  cambiarModoAuth("login");
}

formAuth.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nombre = $("#auth-nombre").value.trim();
  const email = $("#auth-email").value.trim().toLowerCase();
  const clave = $("#auth-clave").value;
  const usuarios = leerLista(CLAVE_USUARIOS);

  if (!/^\S+@\S+\.\S+$/.test(email)) return mostrarError(errorAuth, "Escribe un correo válido.");

  try {
    if (modoAuth === "registro") {
      if (!nombre) return mostrarError(errorAuth, "Escribe tu nombre.");
      if (clave.length < 6) return mostrarError(errorAuth, "La contraseña debe tener al menos 6 caracteres.");
      if (usuarios.some((u) => u.email === email)) return mostrarError(errorAuth, "Ya existe una cuenta con ese correo.");

      const sal = crearSal();
      usuarios.push({ nombre, email, sal, hash: await cifrar(clave, sal) });

      // La primera cuenta se queda con las tareas y notas que ya existían
      if (usuarios.length === 1) {
        ["tareas", "notas"].forEach((base) => {
          const previo = localStorage.getItem(base);
          if (previo !== null) localStorage.setItem(`${base}:${email}`, previo);
        });
      }
      localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(usuarios));
    } else {
      const usuario = usuarios.find((u) => u.email === email);
      if (!usuario || usuario.hash !== (await cifrar(clave, usuario.sal))) {
        return mostrarError(errorAuth, "Correo o contraseña incorrectos.");
      }
    }
    localStorage.setItem(CLAVE_SESION, email);
    mostrarApp(email);
  } catch {
    mostrarError(errorAuth, "No se pudo completar. Abre la app desde https o localhost.");
  }
});

$("#auth-cambiar").addEventListener("click", () => cambiarModoAuth(modoAuth === "login" ? "registro" : "login"));
$("#btn-salir").addEventListener("click", cerrarSesion);

/* ==========================================================================
   Arranque
   ========================================================================== */

aplicarTema(raiz.dataset.tema || "claro"); // sincroniza el botón con el tema inicial
activarPestana(localStorage.getItem(CLAVE_PESTANA) === "notas" ? "notas" : "tareas");
if (localStorage.getItem("vista") === "dividida") cambiarVista(true, false);
else actualizarBotonVista();

const sesionActiva = localStorage.getItem(CLAVE_SESION);
if (sesionActiva && leerLista(CLAVE_USUARIOS).some((u) => u.email === sesionActiva)) {
  mostrarApp(sesionActiva);
} else {
  cerrarSesion();
}
