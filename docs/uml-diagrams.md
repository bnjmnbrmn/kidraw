# UML Diagrams for Kidraw Application

## 1. Core Drawing Architecture

```mermaid
classDiagram
    class DrawingAreaComponent {
        <<implements AfterViewInit>>
        -commands: Observable~DACommand~
        -daOut: EventEmitter~DANotification~
        -zoomLevel: EventEmitter~number~
        -stage: Stage
        -drawingLayer: DrawingLayer
        -crosshairsLayer: CrosshairsLayer
        -tweens: Tween[]
        +ngAfterViewInit()
        -handleCommands(command: DACommand)
        -zoomIn()
        -zoomOut()
        -recenterView()
        -createNewNode()
        -connectSelectedNodes()
        -unselectAll()
    }

    class DrawingLayer {
        <<extends Layer>>
        -daNodeGroup: Group
        -daEdgeGroup: Group
        -daNodes: DANode[]
        -daEdges: DAEdge[]
        +createNewNode(x: number, y: number)
        +addEdge(src: DANode, dest: DANode)
        +getSelectedDANodes(): DANode[]
        +getSelectedDAEdges(): DAEdge[]
        +unselectAll()
        +appendTextToSelected(text: string)
    }

    class CrosshairsLayer {
        <<extends Layer>>
        -crosshairs: Group
        -verticalLine: Line
        -horizontalLine: Line
        +crosshairsX(): number
        +crosshairsY(): number
        +showCrosshairs()
        +hideCrosshairs()
    }

    class DANode {
        <<extends Group>>
        -_rect: Rect
        -_label: Text
        -_isSelected: boolean
        +isSelected: boolean
        +rect: Rect
        +label: Text
        constructor(x: number, y: number, text: string)
    }

    class DAEdge {
        <<extends Group>>
        -_isSelected: boolean
        -_line: Konva.Arrow
        -srcNode: DANode
        -destNode: DANode
        -label: string
        +isSelected: boolean
        +line: Konva.Line
        constructor(src: DANode, dest: DANode, label: string)
    }

    DrawingAreaComponent --> DrawingLayer : contains
    DrawingAreaComponent --> CrosshairsLayer : contains
    DrawingLayer --> DANode : manages
    DrawingLayer --> DAEdge : manages
    DAEdge --> DANode : connects
```

## 2. Input/Command System

```mermaid
classDiagram
    class KeyMenuComponent {
        -keyMenu: KeyMenu~DACommand~
        -keyMenuOut: EventEmitter~DACommand~
        +ngAfterViewInit()
        -handleKeyDown(event: KeyboardEvent)
        -handleKeyUp(event: KeyboardEvent)
    }

    class KeyMenu~T~ {
        -containingHTMLElement: HTMLElement
        -currentMode: KeyMenuMode~T~
        -modesForNames: Map~string, KeyMenuMode~
        -keysDown: Set~string~
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
        +switchMode(modeName: string)
    }

    class DefaultUSStackKMMode~T~ {
        -stack: DefaultUSStackKMModeSubmenu~T~[]
        -konvaGroup: Group
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
        -stackTop: DefaultUSStackKMModeSubmenu~T~
    }

    class DefaultUSStackKMModeSubmenu~T~ {
        -keys: Map~string, DefaultUSStackKMModeKey~
        -keyActions: Map~string, () => void~
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
    }

    class DACommand {
        <<enumeration>>
        MOVE_CROSSHAIRS_LEFT
        MOVE_CROSSHAIRS_RIGHT
        MOVE_CROSSHAIRS_UP
        MOVE_CROSSHAIRS_DOWN
        CREATE_NEW_NODE
        INSERT_CHAR
        EXIT_LABEL_EDIT_MODE
        MULTI_ITEM_SELECT
        SINGLE_ITEM_TOGGLE_SELECT
        ZOOM_IN
        ZOOM_OUT
        CONNECT_SELECTED_NODES
        RECENTER_VIEW
        RECENTER_CROSSHAIRS
        UNSELECT_ALL
    }

    KeyMenuComponent --> KeyMenu : uses
    KeyMenu --> DefaultUSStackKMMode : creates
    DefaultUSStackKMMode --> DefaultUSStackKMModeSubmenu : contains
    DefaultUSStackKMModeSubmenu --> DACommand : emits
    KeyMenuComponent --> DACommand : handles
```

## 3. Service Layer

```mermaid
classDiagram
    class DemoDataService {
        +createDemoGraph(drawingLayer: DrawingLayer)
        -createNode(x: number, y: number, text: string): DANode
        -createEdge(src: DANode, dest: DANode): DAEdge
    }

    class GeometryUtils {
        <<utility>>
        +arrowPointForLineToGroup(line: Line, group: Group): Point
        +lineSegments(line: Line): LineSegment[]
        +rectContainsPoint(rect: IRect, point: Point): boolean
        +rectSegments(rect: IRect): LineSegment[]
        +closest(points: Point[], reference: Point): Point
    }

    class DANotification {
        <<enumeration>>
        STARTED_LABEL_EDITING_MODE
    }

    DemoDataService --> DrawingLayer : modifies
    DemoDataService --> DANode : creates
    DemoDataService --> DAEdge : creates
    GeometryUtils --> Point : uses
    GeometryUtils --> LineSegment : uses
```

## 4. Konva Integration Layer

```mermaid
classDiagram
    class Stage {
        +container: string
        +width: number
        +height: number
        +add(layer: Layer)
        +draw()
    }

    class Layer {
        +add(node: Node)
        +remove(node: Node)
        +draw()
    }

    class Group {
        +x(): number
        +y(): number
        +width(): number
        +height(): number
        +getPosition(): Vector2d
        +getClientRect(): IRect
    }

    class Rect {
        +width: number
        +height: number
        +fill: string
        +stroke: string
        +strokeWidth: number
    }

    class Text {
        +text: string
        +fontSize: number
        +fontFamily: string
        +fill: string
    }

    class Arrow {
        +points: number[]
        +stroke: string
        +strokeWidth: number
        +fill: string
        +pointerLength: number
        +pointerWidth: number
    }

    class Line {
        +points: number[]
        +stroke: string
        +strokeWidth: number
    }

    Stage --> Layer : contains
    Layer --> Group : contains
    Group --> Rect : can contain
    Group --> Text : can contain
    Group --> Arrow : can contain
    Group --> Line : can contain
```

## 5. Component Hierarchy (Angular)

```mermaid
classDiagram
    class AppComponent {
        -onZoomLevelChange(zoomLevel: number)
    }

    class HeaderComponent {
        -zoomLevel: number
        +onZoomLevelChange(zoomLevel: number)
    }

    class DrawingAreaComponent {
        <<as shown in diagram 1>>
    }

    class KeyMenuComponent {
        <<as shown in diagram 2>>
    }

    AppComponent --> HeaderComponent : contains
    AppComponent --> DrawingAreaComponent : contains
    AppComponent --> KeyMenuComponent : contains
    DrawingAreaComponent --> AppComponent : emits zoomLevel
    KeyMenuComponent --> DrawingAreaComponent : emits commands
```

## 6. Data Flow Architecture

```mermaid
flowchart TD
    A[User Input] --> B[KeyMenuComponent]
    B --> C{Key Handling}
    C -->|Normal Mode| D[Command Emission]
    C -->|Label Edit Mode| E[Text Commands]
    D --> F[DrawingAreaComponent]
    E --> F
    F --> G{Command Processing}
    G --> H[Layer Updates]
    G --> I[View Changes]
    G --> J[Zoom Updates]
    H --> K[Konva Rendering]
    I --> K
    J --> L[HeaderComponent]
    K --> M[Visual Feedback]
    L --> M
```

## 7. Class Relationships Summary

### Core Entities
- **DrawingAreaComponent**: Main orchestrator, handles user commands
- **DrawingLayer**: Manages graph elements (nodes/edges)
- **CrosshairsLayer**: Manages crosshair display
- **DANode**: Visual representation of graph nodes
- **DAEdge**: Visual representation of graph edges

### Input System
- **KeyMenuComponent**: Handles keyboard input
- **KeyMenu**: Manages different input modes
- **DefaultUSStackKMMode**: Implements vim-like key bindings
- **DACommand**: Command objects for user actions

### Supporting Infrastructure
- **DemoDataService**: Creates sample graphs
- **GeometryUtils**: Mathematical calculations
- **Konva Classes**: Low-level rendering primitives

### Key Patterns
- **Observer Pattern**: Event emitters for communication
- **Command Pattern**: DACommand objects encapsulate user actions
- **Strategy Pattern**: Different key modes (normal, label edit)
- **Composition Pattern**: Konva groups contain visual elements
- **Factory Pattern**: DemoDataService creates graph elements
