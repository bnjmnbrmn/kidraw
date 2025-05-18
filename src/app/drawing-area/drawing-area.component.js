"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawingAreaComponent = void 0;
const core_1 = require("@angular/core");
const da_node_1 = require("./da-node");
const konva_1 = __importDefault(require("konva"));
const da_crosshairs_1 = require("./da-crosshairs");
const da_edge_1 = require("./da-edge");
const command_model_1 = require("./command.model");
const utils_1 = require("./utils");
var Layer = konva_1.default.Layer;
var Stage = konva_1.default.Stage;
var Group = konva_1.default.Group;
var Tween = konva_1.default.Tween;
var Easings = konva_1.default.Easings;
let DrawingAreaComponent = (() => {
    let _classDecorators = [(0, core_1.Component)({
            selector: 'app-drawing-area',
            imports: [],
            templateUrl: './drawing-area.component.html',
            styleUrl: './drawing-area.component.css'
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _commands_decorators;
    let _commands_initializers = [];
    let _commands_extraInitializers = [];
    let _daOut_decorators;
    let _daOut_initializers = [];
    let _daOut_extraInitializers = [];
    var DrawingAreaComponent = _classThis = class {
        constructor() {
            this.commands = __runInitializers(this, _commands_initializers, void 0);
            this.daOut = (__runInitializers(this, _commands_extraInitializers), __runInitializers(this, _daOut_initializers, new core_1.EventEmitter()));
            this.componentNE = (__runInitializers(this, _daOut_extraInitializers), (0, core_1.inject)(core_1.ElementRef).nativeElement);
            this.daNodes = [];
            this.daEdges = [];
            this.tweens = [];
        }
        ngAfterViewInit() {
            this.stage = new Stage({
                container: 'mainDrawingArea',
                width: this.componentNE.offsetWidth,
                height: this.componentNE.offsetHeight,
            });
            this.stage.container().style.backgroundColor = 'white';
            this.mainLayer = new Layer();
            this.mainLayer.move({ x: this.stage.width() / 2, y: this.stage.height() / 2 });
            this.stage.add(this.mainLayer);
            this.daEdgeGroup = new Group();
            this.mainLayer.add(this.daEdgeGroup);
            this.daNodeGroup = new Group();
            this.mainLayer.add(this.daNodeGroup);
            this.crosshairsLayer = new Layer();
            this.crosshairs = new da_crosshairs_1.DACrosshairs();
            this.crosshairsLayer.add(this.crosshairs);
            this.crosshairsLayer.move({ x: this.stage.width() / 2, y: this.stage.height() / 2 });
            this.stage.add(this.crosshairsLayer);
            this.commands.subscribe(this.handleCommands.bind(this));
            this.resizeObserver = new ResizeObserver(entries => {
                this.stage.width(this.componentNE.offsetWidth);
                this.stage.height(this.componentNE.offsetHeight);
            });
            this.resizeObserver.observe(this.componentNE);
            //todo: remove
            // this.createNewNode();
            // this.insertChar("fdsa");
            // this.exitLabelEditMode();
            // this.moveCrosshairsLeft();
            // this.moveCrosshairsLeft();
            // this.moveCrosshairsLeft();
            // this.moveCrosshairsLeft();
            // this.moveCrosshairsLeft();
            // this.createNewNode();
            // this.insertChar("fdsa");
            // this.exitLabelEditMode();
            // this.moveCrosshairsUp();
            // this.moveCrosshairsUp();
            // this.moveCrosshairsUp();
            // this.moveCrosshairsUp();
        }
        handleCommands(command) {
            switch (command.kind) {
                case command_model_1.DACommandType.MOVE_CROSSHAIRS_LEFT:
                    this.moveCrosshairsLeft();
                    break;
                case command_model_1.DACommandType.MOVE_CROSSHAIRS_DOWN:
                    this.moveCrosshairsDown();
                    break;
                case command_model_1.DACommandType.MOVE_CROSSHAIRS_RIGHT:
                    this.moveCrosshairsRight();
                    break;
                case command_model_1.DACommandType.MOVE_CROSSHAIRS_UP:
                    this.moveCrosshairsUp();
                    break;
                case command_model_1.DACommandType.CREATE_NEW_NODE:
                    this.createNewNode();
                    break;
                case command_model_1.DACommandType.INSERT_CHAR:
                    const key = command.value;
                    this.insertChar(key);
                    break;
                case command_model_1.DACommandType.EXIT_LABEL_EDIT_MODE:
                    this.exitLabelEditMode();
                    break;
                case command_model_1.DACommandType.TOGGLE_ITEM_SELECTION:
                    this.toggleItemSelection();
                    break;
                case command_model_1.DACommandType.ZOOM_IN:
                    this.zoomIn();
                    break;
                case command_model_1.DACommandType.ZOOM_OUT:
                    this.zoomOut();
                    break;
                case command_model_1.DACommandType.CONNECT_SELECTED_NODES:
                    this.connectSelectedNodes();
                    break;
                default:
                    this.assertNever(command);
            }
        }
        assertNever(x) {
            throw new Error(`Unexpected object: ${x}`);
        }
        toggleItemSelection() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            console.log("this.daNodes", this.daNodes);
            const daNodesContainingCrosshairs = this.getDANodesContainingCrosshairs();
            console.log("daNodesContainingCrosshairs", daNodesContainingCrosshairs);
            daNodesContainingCrosshairs.forEach(daNode => daNode.isSelected = !daNode.isSelected);
            const daEdgesContainingCrosshairs = this.getDAEdgesContainingCrosshairs();
            daEdgesContainingCrosshairs.forEach(daEdge => daEdge.isSelected = !daEdge.isSelected);
        }
        exitLabelEditMode() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            console.log("case exit-label-edit-mode");
            this.crosshairs.show();
            this.getSelectedDANodes().forEach(daNode => {
                daNode.isSelected = false;
            });
        }
        insertChar(key) {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            this.getSelectedDANodes().forEach(daNode => {
                daNode.label.text(daNode.label.text() + key);
            });
            this.crosshairs.hide();
        }
        connectSelectedNodes() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            const selectedDANodes = this.getSelectedDANodes();
            //todo: connect to self
            if (selectedDANodes.length <= 1)
                return;
            for (let selectedDANodeA of selectedDANodes) {
                for (let selectedDANodeB of selectedDANodes) {
                    if (selectedDANodeA != selectedDANodeB) {
                        let daEdge = new da_edge_1.DAEdge(selectedDANodeA, selectedDANodeB, "");
                        console.log(daEdge);
                        this.daEdgeGroup.add(daEdge);
                        this.daEdges.push(daEdge);
                    }
                }
            }
            return;
        }
        zoomIn() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            const oldScale = this.mainLayer.scaleX();
            const newScale = oldScale * 2.0;
            this.tweens.push(new Tween({
                node: this.mainLayer,
                duration: .1,
                // todo: why doesn't
                // scale: {x: newScale, y: newScale},
                // work?
                scaleX: newScale,
                scaleY: newScale
            }).play());
            // this.mainLayer.scale({x: newScale, y: newScale});
        }
        zoomOut() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            const oldScale = this.mainLayer.scaleX();
            const newScale = oldScale * 1.0 / 2.0;
            let scale = { x: newScale, y: newScale };
            console.log("scale", scale);
            this.tweens.push(new Tween({
                node: this.mainLayer,
                duration: .1,
                scaleX: newScale,
                scaleY: newScale
            }).play());
            // this.mainLayer.scale({x: newScale, y: newScale});
        }
        moveCrosshairsUp() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            if (this.crosshairs.y() > -this.stage.height() / 2 + 60) {
                this.tweens.push(new Tween({
                    node: this.crosshairs,
                    duration: .1,
                    y: this.crosshairs.y() - 50,
                    easing: Easings.Linear
                }).play());
            }
            else {
                this.tweens.push(new Tween({
                    node: this.mainLayer,
                    duration: .1,
                    y: this.mainLayer.y() + 50,
                    easing: Easings.Linear
                }).play());
            }
        }
        moveCrosshairsRight() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            if (this.crosshairs.x() < this.stage.width() / 2 - 60) {
                this.tweens.push(new Tween({
                    node: this.crosshairs,
                    duration: .1,
                    x: this.crosshairs.x() + 50,
                    easing: Easings.Linear
                }).play());
            }
            else
                this.tweens.push(new Tween({
                    node: this.mainLayer,
                    duration: .1,
                    x: this.mainLayer.x() - 50,
                    easing: Easings.Linear
                }).play());
            // this.mainLayer.move({x: -50, y: 0})
        }
        moveCrosshairsDown() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            if (this.crosshairs.y() < this.stage.height() / 2 - 60)
                this.tweens.push(new Tween({
                    node: this.crosshairs,
                    duration: .1,
                    y: this.crosshairs.y() + 50,
                    easing: Easings.Linear
                }).play());
            // this.crosshairs.move({x: 0, y: 50});
            else {
                this.tweens.push(new Tween({
                    node: this.mainLayer,
                    duration: .1,
                    y: this.mainLayer.y() - 50,
                    easing: Easings.Linear
                }).play());
            }
        }
        moveCrosshairsLeft() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            if (this.crosshairs.x() > -this.stage.width() / 2 + 60) {
                this.tweens.push(new Tween({
                    node: this.crosshairs,
                    duration: .1,
                    x: this.crosshairs.x() - 50,
                    easing: Easings.Linear
                }).play());
            }
            else {
                this.tweens.push(new Tween({
                    node: this.mainLayer,
                    duration: .1,
                    x: this.mainLayer.x() + 50,
                    easing: Easings.Linear
                }).play());
                // this.mainLayer.move({x: 50, y: 0})
            }
        }
        createNewNode() {
            this.tweens.forEach(t => t.finish());
            this.tweens = [];
            console.log("creating new node");
            console.log("this.mainLayer.x(): ", this.mainLayer.x());
            console.log("this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x", this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x);
            let daNode = new da_node_1.DANode((this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x - (this.mainLayer.x() - this.stage.width() / 2)) / this.mainLayer.scaleX(), (this.crosshairs.getAbsolutePosition(this.crosshairsLayer).y - (this.mainLayer.y() - this.stage.height() / 2)) / this.mainLayer.scaleY(), "");
            this.daNodeGroup.add(daNode);
            this.daNodes.push(daNode);
            this.daOut.emit({ kind: "started-label-editing-mode" });
        }
        getDANodesContainingCrosshairs() {
            return this.daNodes.filter(daNode => {
                return (0, utils_1.rectContainsPoint)(daNode.getClientRect(), this.crosshairs.getAbsolutePosition());
            });
        }
        getSelectedDANodes() {
            return this.daNodes.filter((daNode) => daNode.isSelected);
        }
        getDAEdgesContainingCrosshairs() {
            return this.daEdges.filter(daEdge => (0, utils_1.lineIntersectsGroupBoundingRect)(daEdge.line, this.crosshairs));
        }
    };
    __setFunctionName(_classThis, "DrawingAreaComponent");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _commands_decorators = [(0, core_1.Input)({ required: true })];
        _daOut_decorators = [(0, core_1.Output)()];
        __esDecorate(null, null, _commands_decorators, { kind: "field", name: "commands", static: false, private: false, access: { has: obj => "commands" in obj, get: obj => obj.commands, set: (obj, value) => { obj.commands = value; } }, metadata: _metadata }, _commands_initializers, _commands_extraInitializers);
        __esDecorate(null, null, _daOut_decorators, { kind: "field", name: "daOut", static: false, private: false, access: { has: obj => "daOut" in obj, get: obj => obj.daOut, set: (obj, value) => { obj.daOut = value; } }, metadata: _metadata }, _daOut_initializers, _daOut_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        DrawingAreaComponent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return DrawingAreaComponent = _classThis;
})();
exports.DrawingAreaComponent = DrawingAreaComponent;
