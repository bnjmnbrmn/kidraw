# Class Inheritance and Interface Implementation Diagrams

## 1. Angular Component Hierarchy

```mermaid
classDiagram
    class AfterViewInit {
        <<interface>>
        +ngAfterViewInit(): void
    }

    class OnDestroy {
        <<interface>>
        +ngOnDestroy(): void
    }

    class Component {
        <<decorator>>
        <<Angular>>
    }

    class AppComponent {
        +onZoomLevelChange(zoomLevel: number)
    }

    class DrawingAreaComponent {
        <<implements AfterViewInit>>
        -commands: Observable~DACommand~
        -daOut: EventEmitter~DANotification~
        -zoomLevel: EventEmitter~number~
        +ngAfterViewInit(): void
        -handleCommands(command: DACommand)
    }

    class KeyMenuComponent {
        <<implements AfterViewInit>>
        -keyMenu: KeyMenu~DACommand~
        -keyMenuOut: EventEmitter~DACommand~
        +ngAfterViewInit(): void
        -handleKeyDown(event: KeyboardEvent)
    }

    class HeaderComponent {
        -zoomLevel: number
        +onZoomLevelChange(zoomLevel: number)
    }

    AfterViewInit <|.. DrawingAreaComponent : implements
    AfterViewInit <|.. KeyMenuComponent : implements
    Component <|-- AppComponent : extends
    Component <|-- DrawingAreaComponent : extends
    Component <|-- KeyMenuComponent : extends
    Component <|-- HeaderComponent : extends
```

## 2. Konva.js Inheritance Hierarchy

```mermaid
classDiagram
    class Node {
        <<abstract>>
        <<Konva>>
        +x(): number
        +y(): number
        +width(): number
        +height(): number
        +getPosition(): Vector2d
        +getClientRect(): IRect
        +parent: Container
    }

    class Container {
        <<abstract>>
        <<Konva>>
        +add(node: Node)
        +remove(node: Node)
        +children: Node[]
    }

    class Layer {
        <<Konva>>
        +batchDraw()
        +draw()
        +clear()
    }

    class Stage {
        <<Konva>>
        +container: HTMLElement
        +width: number
        +height: number
        +add(layer: Layer)
        +draw()
    }

    class Group {
        <<Konva>>
        +x(): number
        +y(): number
        +width(): number
        +height(): number
    }

    class Shape {
        <<abstract>>
        <<Konva>>
        +stroke: string
        +strokeWidth: number
        +fill: string
    }

    class Rect {
        <<Konva>>
        +width: number
        +height: number
        +cornerRadius: number
    }

    class Text {
        <<Konva>>
        +text: string
        +fontSize: number
        +fontFamily: string
        +align: string
        +verticalAlign: string
    }

    class Line {
        <<Konva>>
        +points: number[]
        +stroke: string
        +strokeWidth: number
    }

    class Arrow {
        <<Konva>>
        +points: number[]
        +stroke: string
        +strokeWidth: number
        +fill: string
        +pointerLength: number
        +pointerWidth: number
    }

    class Tween {
        <<Konva>>
        +node: Node
        +duration: number
        +play()
        +finish()
        +onFinish(callback: Function)
    }

    Node <|-- Container : extends
    Node <|-- Shape : extends
    Container <|-- Layer : extends
    Container <|-- Group : extends
    Layer <|-- Stage : extends (composition)
    Shape <|-- Rect : extends
    Shape <|-- Text : extends
    Shape <|-- Line : extends
    Shape <|-- Arrow : extends
```

## 3. Custom Drawing Classes

```mermaid
classDiagram
    class Group {
        <<Konva>>
        +x(): number
        +y(): number
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
        -_line: Arrow
        -srcNode: DANode
        -destNode: DANode
        -label: string
        +isSelected: boolean
        +line: Arrow
        constructor(src: DANode, dest: DANode, label: string)
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

    Group <|-- DANode : extends
    Group <|-- DAEdge : extends
    Layer <|-- DrawingLayer : extends
    Layer <|-- CrosshairsLayer : extends
```

## 4. KeyMenu System Interfaces

```mermaid
classDiagram
    class KeyMenuMode~T~ {
        <<interface>>
        +name: string
        +konvaGroup: Group
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
        +beforeSwitchIn(): void
        +beforeSwitchOut(): void
    }

    class KeyMenuModeConfig~T, M~ {
        <<interface>>
        +createMode(name: string, keyMenu: KeyMenu~T~): M
    }

    class DefaultUSStackKMModeConfig~T~ {
        <<implements KeyMenuModeConfig~T, DefaultUSStackKMMode~T~~>>
        -rootSubmenuConfig: DefaultUSStackKMModeSubmenuConfig
        +createMode(name: string, keyMenu: KeyMenu~T~): DefaultUSStackKMMode~T~
    }

    class DefaultUSStackKMMode~T~ {
        <<implements KeyMenuMode~T~~>>
        -stack: DefaultUSStackKMModeSubmenu~T~[]
        -konvaGroup: Group
        -actionSchedulingEnabled: boolean
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
        +beforeSwitchIn(): void
        +beforeSwitchOut(): void
    }

    class PrintedInstructionKeyMenuModeConfig {
        <<implements KeyMenuModeConfig~DACommand, PrintedInstructionKMMode~~>>
        +instructions: string
        +keyDownHandler: Function
        +keyUpHandler: Function
        +createMode(name: string, keyMenu: KeyMenu~DACommand~): PrintedInstructionKMMode
    }

    class PrintedInstructionKMMode {
        <<implements KeyMenuMode~DACommand~~>>
        -instructions: string
        -konvaGroup: Group
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
    }

    KeyMenuMode <|.. DefaultUSStackKMMode : implements
    KeyMenuMode <|.. PrintedInstructionKMMode : implements
    KeyMenuModeConfig <|.. DefaultUSStackKMModeConfig : implements
    KeyMenuModeConfig <|.. PrintedInstructionKeyMenuModeConfig : implements
```

## 5. Service and Utility Classes

```mermaid
classDiagram
    class Injectable {
        <<decorator>>
        <<Angular>>
    }

    class DemoDataService {
        <<@Injectable>>
        +createDemoGraph(drawingLayer: DrawingLayer)
        -createNode(x: number, y: number, text: string): DANode
        -createEdge(src: DANode, dest: DANode): DAEdge
    }

    class GeometryUtils {
        <<utility>>
        <<no inheritance>>
        +arrowPointForLineToGroup(line: Line, group: Group): Point
        +lineSegments(line: Line): LineSegment[]
        +rectContainsPoint(rect: IRect, point: Point): boolean
        +rectSegments(rect: IRect): LineSegment[]
        +closest(points: Point[], reference: Point): Point
    }

    class KeyMenu~T~ {
        <<no inheritance>>
        -containingHTMLElement: HTMLElement
        -currentMode: KeyMenuMode~T~
        -modesForNames: Map~string, KeyMenuMode~
        -keysDown: Set~string~
        +handleKeyDown(event: KeyboardEvent)
        +handleKeyUp(event: KeyboardEvent)
        +switchMode(modeName: string)
    }

    Injectable <|.. DemoDataService : decorated with
```

## 6. Type Definitions and Models

```mermaid
classDiagram
    class Point {
        <<type>>
        +x: number
        +y: number
    }

    class LineSegment {
        <<type>>
        +p1: Point
        +p2: Point
        +getLineIntersection(other: LineSegment): Point
    }

    class IRect {
        <<interface>>
        +x: number
        +y: number
        +width: number
        +height: number
    }

    class Vector2d {
        <<Konva type>>
        +x: number
        +y: number
    }

    class DANotification {
        <<type union>>
        STARTED_LABEL_EDITING_MODE
    }

    class DACommand {
        <<type union>>
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

    class DACommandType {
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
```

## 7. Summary of Inheritance Relationships

### Angular Components
- **All components extend** `Component` (via decorator)
- **DrawingAreaComponent & KeyMenuComponent implement** `AfterViewInit`
- **No custom interfaces** for components

### Konva-based Classes
- **DANode extends** `Group` (Konva)
- **DAEdge extends** `Group` (Konva)  
- **DrawingLayer extends** `Layer` (Konva)
- **CrosshairsLayer extends** `Layer` (Konva)
- **All visual elements extend** Konva base classes

### KeyMenu System
- **DefaultUSStackKMMode implements** `KeyMenuMode<T>`
- **PrintedInstructionKMMode implements** `KeyMenuMode<T>`
- **Config classes implement** `KeyMenuModeConfig<T, M>`

### Services
- **DemoDataService decorated with** `@Injectable` (Angular)
- **No inheritance** - standalone utility class

### Utility Classes
- **GeometryUtils**: Static utility functions, no inheritance
- **Type definitions**: TypeScript types and interfaces, no inheritance

### Key Patterns
- **Composition over inheritance** for most custom classes
- **Interface implementation** for KeyMenu system
- **Konva inheritance** for visual rendering
- **Angular decorators** for component/service registration
