import {AfterViewInit, Component, ElementRef, inject, ViewChild} from '@angular/core';

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

  ngAfterViewInit(): void {
    this.canvas = this.mainDrawingAreaER.nativeElement as HTMLCanvasElement;
    this.canvas.height = this.componentNE.offsetHeight;
    this.canvas.width = this.componentNE.offsetWidth;
    this.ctx = this.canvas.getContext("2d")!;

    this.drawCrosshairs(this.ctx, this.canvas.width / 2, this.canvas.height / 2,
      this.canvas.width, this.canvas.height
    );
  }

  drawCrosshairs(c: CanvasRenderingContext2D, x: number, y: number,
                 canvasWidth: number, canvasHeight: number) {

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
