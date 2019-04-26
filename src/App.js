import React, { Component } from "react";
import CanvasDraw from "react-canvas-draw";
import { output } from "./deep";
import "./App.css";

class App extends Component {
  saveData;
  fileinput;
  drawer;
  state = {
    options: {
      loadTimeOffset: 0,
      lazyRadius: 1,
      brushRadius: 1,
      brushColor: "black",
      catenaryColor: "black",
      gridColor: "rgba(150,150,150,0.17)",
      hideGrid: true,
      canvasWidth: "100vw",
      canvasHeight: "100vw",
      disabled: false,
      imgSrc: "",
      saveData: null,
      immediateLoading: false
    }
  };
  render() {
    return (
      <div>
        <input
          ref={e => {
            this.fileinput = e;
          }}
          type="file"
          onChange={e => {
            var reader = new FileReader();
            reader.readAsDataURL(e.currentTarget.files[0]);
            reader.onload = e => {
              //将结果显示到canvas
              var ctx = this.drawer.ctx.drawing;
              //加载图片
              var img = new Image();
              img.onload = () => {
                ctx.drawImage(
                  img,
                  0,
                  0,
                  img.width,
                  img.height,
                  0,
                  0,
                  this.drawer.canvas.drawing.width,
                  this.drawer.canvas.drawing.height
                );
              };
              img.src = e.currentTarget.result;
            };

            e.currentTarget.value = "";
          }}
          style={{ display: "none" }}
        />
        <CanvasDraw
          ref={e => {
            this.drawer = e;
          }}
          style={{ maxWidth: 512, maxHeight: 512, border: "1px solid black" }}
          {...this.state.options}
        />
        <div
          style={{
            display: "flex",
            maxWidth: 512,
            maxHeight: 512,
            justifyContent: "space-around"
          }}
        >
          <select
            onChange={e => {
              console.log(e.currentTarget.value);
              if (e.currentTarget.value === "write") {
                this.setState({
                  options: {
                    ...this.state.options,
                    ...{
                      brushRadius: 1,
                      lazyRadius: 1,
                      brushColor: "black",
                      catenaryColor: "black"
                    }
                  }
                });
              } else {
                this.setState({
                  options: {
                    ...this.state.options,
                    ...{
                      brushRadius: 10,
                      lazyRadius: 10,
                      brushColor: "white",
                      catenaryColor: "gray"
                    }
                  }
                });
              }
            }}
          >
            <option value="write">write</option>
            <option value="clear">clear</option>
          </select>
          <button
            onClick={() => {
              this.fileinput.click();
            }}
            style={{ flex: 1, height: 50 }}
          >
            import
          </button>
          <button
            onClick={e => {
              console.log(this.drawer.canvas);
            }}
            style={{ flex: 1, height: 50 }}
          >
            save
          </button>
          <button
            onClick={() => {
              this.drawer.undo();
            }}
            style={{ flex: 1, height: 50 }}
          >
            undo
          </button>
          <button
            onClick={() => {
              this.drawer.clear();
            }}
            style={{ flex: 1, height: 50 }}
          >
            clear
          </button>
          {this.state.options.disabled ? (
            <button
              onClick={() => {
                this.drawer.loadSaveData(this.saveData)
                this.setState({
                  options: {
                    ...this.state.options,
                    ...{
                      disabled: false
                    }
                  }
                });
              }}
              style={{ flex: 1, height: 50 }}
            >
              draw
            </button>
          ) : (
            <button
              onClick={() => {
                this.setState({
                  options: {
                    ...this.state.options,
                    ...{
                      disabled: true
                    }
                  }
                });
                this.saveData = this.drawer.getSaveData();
                output(
                  this.drawer.canvas.drawing,
                  this.drawer.canvas.drawing,
                  "./edges2cats_AtoB.pict",
                  this.drawer.canvas.width
                );
              }}
              style={{ flex: 1, height: 50 }}
            >
              deep
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default App;
