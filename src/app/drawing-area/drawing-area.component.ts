import {AfterViewInit, Component, ElementRef, inject, Input, ViewChild} from '@angular/core';
import {Observable} from 'rxjs';
import {Command} from './command.model';

@Component({
  selector: 'app-drawing-area',
  imports: [],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit {

  private componentER = inject<ElementRef<HTMLElement>>(ElementRef);
  private componentNE = this.componentER.nativeElement;
  @ViewChild('mainDrawingArea') private mainDrawingAreaER!: ElementRef;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  private crosshairsX!: number;
  private crosshairsY!: number;

  private resizeObserver!: ResizeObserver;

  @Input({required: true}) commands!: Observable<Command>;

  ngAfterViewInit(): void {
    this.canvas = this.mainDrawingAreaER.nativeElement as HTMLCanvasElement;
    this.canvas.height = this.componentNE.offsetHeight;
    this.canvas.width = this.componentNE.offsetWidth;
    this.ctx = this.canvas.getContext("2d")!;

    this.crosshairsX = this.canvas.width / 2;
    this.crosshairsY = this.canvas.height / 2;

    this.redraw();

    this.commands.subscribe(this.handleCommands.bind(this));

    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        console.log("entry: entry");
        const { width, height } = entry.contentRect;
        console.log(`New Size - Width: ${width}, Height: ${height}`);
        this.canvas.height = this.componentNE.offsetHeight;
        this.canvas.width = this.componentNE.offsetWidth;
        this.redraw();
      }
    });
    this.resizeObserver.observe(this.componentNE);
  }

  private redraw() {

    let ctx = this.ctx;

    // ctx.scale(1,1);
    ctx.clearRect(0,0,this.canvas.width, this.canvas.height);
    this.drawCrosshairs();

    ctx.font = "1em Arial";
    ctx.textAlign = "center";
    ctx.textBaseline ="middle";

    this.drawNode(200, 200, "hello");
    this.drawNode(600, 200, "hi");

  }

  private handleCommands(command: Command) {

    console.log("Command: " + command);
    switch (command.kind) {
      case "move-cursor-left":
        this.crosshairsX -= 10;
        break;
      case "move-cursor-down":
        this.crosshairsY += 10;
        break;
      case "move-cursor-right":
        this.crosshairsX += 10;
        break;
      case "move-cursor-up":
        this.crosshairsY -= 10;
        break;
    }

    this.redraw();

  }

  private drawCrosshairs() {

    const c = this.ctx;
    const x = this.crosshairsX;
    const y = this.crosshairsY;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const originalStrokeStyle = c.strokeStyle;
    const originalLineWidth = c.lineWidth;

    c.strokeStyle = 'rgba(0,0,0,0.5)'
    c.lineWidth = 2;

    c.beginPath()
    c.moveTo(x - 20, y);
    c.lineTo(x + 20, y);
    c.stroke()
    c.beginPath()
    c.moveTo(x, y-20);
    c.lineTo(x, y+20);
    c.stroke()

    c.strokeStyle = originalStrokeStyle;
    c.lineWidth = originalLineWidth;
  }


  private drawNode(x: number, y: number, text: string) {

    const nodeWidth = Math.ceil(this.ctx.measureText(text).width / 50.0) * 100;
    // noinspection UnnecessaryLocalVariableJS,JSSuspiciousNameCombination
    const nodeHeight = nodeWidth;

    this.ctx.strokeRect(x, y, nodeWidth, nodeHeight);
    this.ctx.fillText(text, x + nodeWidth/2, y + nodeHeight/2);

    console.log(nodeWidth);

  }
}
