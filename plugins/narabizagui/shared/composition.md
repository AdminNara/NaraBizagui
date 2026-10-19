# Composición proporcionada del proceso

Lee esta referencia al crear o reorganizar una parte amplia del BPMN, o al evaluar su composición. Para un cambio de texto o una exportación basta el alcance puntual. El [ejemplo genérico antes/después](examples/compact-rows/README.md) permite evaluar estas decisiones sin abrir procesos de clientes.

## Elegir la distribución antes de dibujar

Lee una vez el conjunto: secuencia y ramas, responsables, documentos, tamaños, anclajes manuales y obstáculos. Reutiliza el snapshot vigente. Estima el ancho útil descontando encabezados de participante/carril, márgenes, documentos y corredores; dos columnas necesitan al menos `2 × ancho de actividad + separación`, además de esas reservas. Mantén el texto legible y los tamaños acordados; no reduzcas las actividades para hacer caber una propuesta.

Compara la composición actual con una alternativa por filas. Registra ancho, alto, área `ancho × alto` y relación `ancho / alto` del participante, junto con el encuadre al tamaño de uso. Una secuencia escalonada que avanza a otra columna con cada cambio de responsable puede dejar amplias zonas vacías. Las filas pueden aprovechar ese espacio: alinear columnas entre carriles, alternar el sentido de lectura y dar varias filas al actor con más actividades. Una nueva fila no crea actor, etapa, espera ni flujo independiente.

El patrón observado conserva nueve actividades de 260×100: participante de 1900×960 a 906×1280, ancho −52.3 %, alto +33.3 % y área −36.4 %. Son medidas de un caso, no objetivos ni una plantilla obligatoria. Evalúa el coste de crecer en alto y la lectura en pantalla o informe. Conserva una disposición horizontal cuando sus ramas, documentos o formato de uso la hagan más clara. No introduzcas etapas artificiales para llenar columnas, distribución diagonal por rutina ni dos flujos separados en una hoja para reducir el tamaño aparente.

La lectura puede ser izquierda→derecha en una fila y derecha→izquierda en la siguiente. La flecha conserva su origen, destino y significado: mover el destino a la izquierda no invierte la secuencia. Alinea las columnas previstas sin desplazar elementos ajenos al alcance.

## Planear conexiones como conjunto

Reserva corredores y espacio para documentos/etiquetas junto con las filas. Elige salida y entrada según el orden espacial nuevo, las ramas y los obstáculos. Una actividad a la derecha seguida de otra a la izquierda suele admitir salida `left` y entrada `right`; un cambio de fila puede usar `bottom`/`top` o un corredor lateral. No heredes ciegamente `right`/`left` de la versión anterior. No uses diagonales ni tantees una conexión tras otra por coordenadas.

Distingue un lado heredado accidentalmente de un anclaje intencional: respeta este último y planifica alrededor. Si debe cambiarse, incluye solo las conexiones afectadas en el alcance autorizado. Omitir lados en `route_orthogonal` conserva los persistidos; `auto` es una elección explícita. Usa lados/offsets explícitos cuando la intención esté definida; `route` sirve para un recorrido ortogonal deliberado ya calculado. No recalcules rutas manuales ajenas.

Si un movimiento compatible produce un retroceso, diagonal, rodeo o cambio de anclaje inesperado, conserva revisión, IDs y recorrido mínimo del fallo. Registra una incidencia de producto con un caso genérico y la capacidad necesaria. No reconstruyas el diagrama, borres conexiones para recrearlas ni hagas una serie de ajustes de prueba para ocultar el fallo. La corrección del editor se valida por separado de la composición y del proceso.

## Documentos y salidas de sistema

Coloca cada documento cerca de sus actividades, con etiqueta y asociaciones legibles. Reutiliza el documento real, incluidas hojas/rangos del mismo libro; hasta cinco asociaciones son admisibles si se distinguen sin cruces ni contactos indebidos. Ese máximo no obliga a dibujar cinco ni justifica duplicar un archivo. Conserva IDs y asociaciones existentes; no inventes archivos, rótulos explicativos ni notas de revisión para resolver la geometría.

Una consulta o selección puede devolver datos temporales sin persistirlos. Antes de mostrar un archivo, registro guardado o almacén como salida, comprueba qué actividad escribe efectivamente y dónde. Un resultado de consulta puede representarse como datos de trabajo si ayuda a entender el proceso, sin atribuirle persistencia. `documentFormat`/`documentUse` eligen presentación y uso; no demuestran una escritura. Conserva la duda fuera del lienzo cuando las fuentes no la resuelvan.

## Ejecución ágil y capacidades reales

Plan proporcional en el proyecto o en el turno: actividades por fila/carril, dimensiones, corredores y conexiones afectadas. Un bloque compatible usa revisión vigente, UUID y validación incremental de su respuesta; una única confirmación visual comprueba el resultado. En un montaje grande, verifica primero un tramo representativo solo cuando exista incertidumbre relevante. No repitas lectura, prevalidación ni imagen si ya cubren la misma revisión. Reducir llamadas no demuestra menor latencia total.

| Necesidad | Capacidad que debe estar disponible | Alternativa soportada / límite |
| --- | --- | --- |
| Cambiar composición existente | `move`/`move_elements`, `resize` y `route` en esquema y `capabilities.batchOperations` | Bloque con geometría explícita preservando IDs. No regenerar un proceso existente con `clear`/`matrix`. |
| Elegir lados | `route_orthogonal`, `orthogonalRouting` y `persistentAnchors` | Si falta, `route` con puntos ortogonales planificados, solo si está admitido y cubre la intención; si no, documentar dependencia y detener esa parte. |
| Recortar margen | `compact_container` y `compactContainer` | Recorta derecha/inferior; conserva altura con carriles. No distribuye tareas ni crea filas. Dimensionar mediante operaciones admitidas o dejar pendiente la compactación. |
| Crear filas automáticamente | No hay una operación `compact_rows` ni un optimizador global declarado en esta fuente | Planear geometría con operaciones disponibles; no inventar un tipo ni sustituirlo por UI/JavaScript. |
| Conservar archivo Microsoft | `microsoft-files-v1` y herramientas/capacidades verificadas en el chat; destino y acciones expresamente autorizados | Resolver una carpeta o archivo exacto, comprobar la cuenta, revisión y documento; crear/abrir/asociar con el contrato [Microsoft](microsoft-files.md), y verificar el guardado. Si el runtime no expone ese contrato, la selección inicial corresponde al usuario en el visor. `open_bpmn` solo importa XML y no asocia un destino. |

Comprueba esquema cargado y capacidades por sesión/build, no solo versión instalada o nombre `visual-quality-v1`. La tabla describe la fuente inspeccionada; no acredita herramientas disponibles en otro chat. Una incidencia o una propuesta no es una capacidad implementada.

## Evaluación separada

1. **Lógica y preservación:** mismos IDs, tipos, nombres, documentación, responsables, decisiones/condiciones/predeterminadas, extremos y asociaciones; mismas dimensiones de actividades y texto legible. Solo cambia la geometría prevista; otras hojas y elementos conservan su estado.
2. **Composición:** medir ancho, alto, área y proporción; comprobar columnas, varias filas cuando convenga, documentos próximos y encuadre al tamaño de uso. Menor área no basta si empeoran lectura o recorridos.
3. **Geometría:** sin diagonales, figuras/etiquetas superpuestas, líneas sobre figuras, cruces/contactos involuntarios, retrocesos ni rodeos evitables. Revisar anclajes intencionales y cobertura real del diagnóstico.
4. **Uso:** una lectura suficiente, plan proporcional, bloque(s) compatibles, validación incremental y una confirmación visual; registrar llamadas/reintentos si se compara agilidad. No confundir tiempo del editor con espera total.

Cero errores BPMN demuestra solo la cobertura técnica declarada. No acredita buena composición, persistencia de datos, guardado ni aceptación de negocio. Con snapshots o ilustraciones, declara pendiente la comprobación del texto renderizado y del editor, sin conectarte a un cliente para suplirla.
