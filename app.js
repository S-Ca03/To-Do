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
const btnGuardarNota = $("#btn-guardar-nota");
const btnCancelar = $("#btn-cancelar");

let notas = [];
let siguienteIdNota = 1;
let idEnEdicion = null;
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
    if (nota.fijada) div.classList.add("fijada");
    if (nota.id === idNotaNueva) div.classList.add("nueva");
    if (nota.id === idEnEdicion) div.classList.add("editando");

    const h3 = document.createElement("h3");
    h3.textContent = nota.titulo;

    const p = document.createElement("p");
    p.textContent = nota.contenido;

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
      crearBoton("btn-editar", "Editar"),
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

function entrarEnEdicion(nota) {
  idEnEdicion = nota.id;
  inputTitulo.value = nota.titulo;
  inputContenido.value = nota.contenido;
  btnGuardarNota.textContent = "Actualizar nota";
  btnCancelar.hidden = false;
  renderizarNotas();
  inputTitulo.focus();
}

function salirDeEdicion() {
  idEnEdicion = null;
  formNota.reset();
  btnGuardarNota.textContent = "Guardar nota";
  btnCancelar.hidden = true;
  renderizarNotas();
}

formNota.addEventListener("submit", (event) => {
  event.preventDefault();
  const titulo = inputTitulo.value.trim();
  const contenido = inputContenido.value.trim();
  const errorNota = $("#error-nota");

  if (titulo === "") return mostrarError(errorNota, "Escribe un título para la nota.");
  if (contenido === "") return mostrarError(errorNota, "Escribe el contenido de la nota.");
  mostrarError(errorNota, "");

  if (idEnEdicion === null) {
    const nueva = { id: siguienteIdNota++, titulo, contenido, creada: Date.now(), fijada: false };
    notas.push(nueva);
    idNotaNueva = nueva.id;
    formNota.reset();
  } else {
    notas = notas.map((n) => (n.id === idEnEdicion ? { ...n, titulo, contenido, editada: Date.now() } : n));
    guardarNotas();
    return salirDeEdicion();
  }
  guardarNotas();
  renderizarNotas();
});

[inputTitulo, inputContenido].forEach((campo) =>
  campo.addEventListener("input", () => mostrarError($("#error-nota"), ""))
);
btnCancelar.addEventListener("click", salirDeEdicion);
buscador.addEventListener("input", renderizarNotas);

contenedorNotas.addEventListener("click", (event) => {
  const div = event.target.closest(".nota");
  if (!div) return;
  const id = Number(div.dataset.id);
  const nota = notas.find((n) => n.id === id);

  if (event.target.classList.contains("btn-editar")) entrarEnEdicion(nota);

  if (event.target.classList.contains("btn-fijar")) {
    nota.fijada = !nota.fijada;
    guardarNotas();
    renderizarNotas();
  }

  if (event.target.classList.contains("btn-eliminar")) {
    animarSalida(div, () => {
      if (idEnEdicion === id) salirDeEdicion();
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
  }
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
    notas = datos.notas;
    siguienteIdTarea = calcularSiguienteId(tareas);
    siguienteIdNota = calcularSiguienteId(notas);
    guardarTareas();
    guardarNotas();
    salirDeEdicion();
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
  });
  siguienteIdNota = calcularSiguienteId(notas);

  filtro = "todas";
  document.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filtro === "todas"));
  buscador.value = "";
  idEnEdicion = null;
  formNota.reset();
  btnGuardarNota.textContent = "Guardar nota";
  btnCancelar.hidden = true;

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
