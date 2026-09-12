const form = document.querySelector("#form-tarea");
const input = document.querySelector("#input-tarea");
const lista = document.querySelector("#lista-tareas");
const listaVacia = document.querySelector("#lista-vacia");

// Cada tarea ahora es { texto, completada }. Si en el navegador ya había
// tareas guardadas en el formato viejo (solo texto), las adaptamos.
let tareas = (JSON.parse(localStorage.getItem("tareas")) || []).map((tarea) =>
  typeof tarea === "string" ? { texto: tarea, completada: false } : tarea
);

function guardarTareas() {
  localStorage.setItem("tareas", JSON.stringify(tareas));
}

function actualizarListaVacia() {
  listaVacia.style.display = tareas.length === 0 ? "block" : "none";
}

function crearTarea(tarea, agregarAlEstado = true) {
  if (agregarAlEstado) {
    tareas.push(tarea);
    guardarTareas();
  }

  const nuevoLi = document.createElement("li");
  nuevoLi.classList.add("tarea");
  if (tarea.completada) {
    nuevoLi.classList.add("completada");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.classList.add("checkbox-tarea");
  checkbox.checked = tarea.completada;

  const spanTexto = document.createElement("span");
  spanTexto.classList.add("texto-tarea");
  spanTexto.textContent = tarea.texto;

  const btnEliminar = document.createElement("button");
  btnEliminar.type = "button";
  btnEliminar.classList.add("btn-eliminar");
  btnEliminar.textContent = "Eliminar";

  // El estado "completada" ya no se pinta a mano con .style: solo se
  // reasigna la clase "completada" y el CSS se encarga del tachado,
  // la opacidad y la animación.
  checkbox.addEventListener("change", () => {
    tarea.completada = checkbox.checked;
    nuevoLi.classList.toggle("completada", tarea.completada);
    guardarTareas();
  });

  nuevoLi.appendChild(checkbox);
  nuevoLi.appendChild(spanTexto);
  nuevoLi.appendChild(btnEliminar);

  lista.appendChild(nuevoLi);
  actualizarListaVacia();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const texto = input.value.trim();
  if (texto === "") {
    alert("Escribe una tarea antes de agregar");
    return;
  }

  crearTarea({ texto, completada: false });
  input.value = "";
  input.focus();
});

lista.addEventListener("click", (event) => {
  if (!event.target.classList.contains("btn-eliminar")) return;

  const li = event.target.closest(".tarea");
  const index = Array.from(lista.children).indexOf(li);

  // Reproduce la animación de salida definida en el CSS (clase
  // "saliendo") y recién después la quita del DOM y del estado.
  li.classList.add("saliendo");
  setTimeout(() => {
    li.remove();
    tareas.splice(index, 1);
    guardarTareas();
    actualizarListaVacia();
  }, 280);
});

tareas.forEach((tarea) => crearTarea(tarea, false));
actualizarListaVacia();
