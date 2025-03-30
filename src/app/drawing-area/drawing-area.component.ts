import {AfterViewInit, Component, ElementRef, inject, Input, ViewChild} from '@angular/core';
import {Observable} from 'rxjs';

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

  @Input({required: true}) commands!: Observable<string>;

  ngAfterViewInit(): void {
    this.canvas = this.mainDrawingAreaER.nativeElement as HTMLCanvasElement;
    this.canvas.height = this.componentNE.offsetHeight;
    this.canvas.width = this.componentNE.offsetWidth;
    this.ctx = this.canvas.getContext("2d")!;

    this.crosshairsX = this.canvas.width / 2;
    this.crosshairsY = this.canvas.height / 2;

    this.redraw();
    this.drawCrosshairs()

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

    this.ctx.clearRect(0,0,this.canvas.width, this.canvas.height);
    this.drawCrosshairs();

  }

  private handleCommands(command: string) {

    console.log("command: " + command);

    if (command === 'left') {
      this.crosshairsX -= 10;
    }
    if (command === 'right') {
      this.crosshairsX += 10;
    }
    if (command === 'up') {
      this.crosshairsY -= 10;
    }
    if (command === 'down') {
      this.crosshairsY += 10;
    }

    this.redraw();

  }

  private drawCrosshairs() {

    const c = this.ctx;
    const x = this.crosshairsX;
    const y = this.crosshairsY;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    c.strokeStyle = 'rgba(0,0,0,0.2)'
    c.lineWidth = 2;

    c.beginPath()
    c.moveTo(0, y);
    c.lineTo(canvasWidth, y);
    c.stroke()
    c.beginPath()
    c.moveTo(x, 0);
    c.lineTo(x, canvasHeight);
    c.stroke()
  }


}
