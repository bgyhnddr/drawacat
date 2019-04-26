import axios from "axios";
import * as dl from "deeplearn";

const weights_cache = {};

function model(input, weights) {
  const math = dl.ENV.math;

  function preprocess(input) {
    return math.subtract(
      math.multiply(input, dl.Scalar.new(2)),
      dl.Scalar.new(1)
    );
  }

  function deprocess(input) {
    return math.divide(math.add(input, dl.Scalar.new(1)), dl.Scalar.new(2));
  }

  function batchnorm(input, scale, offset) {
    var moments = math.moments(input, [0, 1]);
    const varianceEpsilon = 1e-5;
    return math.batchNormalization3D(
      input,
      moments.mean,
      moments.variance,
      varianceEpsilon,
      scale,
      offset
    );
  }

  function conv2d(input, filter, bias) {
    return math.conv2d(input, filter, bias, [2, 2], "same");
  }

  function deconv2d(input, filter, bias) {
    var convolved = math.conv2dTranspose(
      input,
      filter,
      [input.shape[0] * 2, input.shape[1] * 2, filter.shape[2]],
      [2, 2],
      "same"
    );
    var biased = math.add(convolved, bias);
    return biased;
  }

  var preprocessed_input = preprocess(input);

  var layers = [];

  var filter = weights["generator/encoder_1/conv2d/kernel"];
  var bias = weights["generator/encoder_1/conv2d/bias"];
  var convolved = conv2d(preprocessed_input, filter, bias);
  layers.push(convolved);

  for (var i = 2; i <= 8; i++) {
    var scope = "generator/encoder_" + i.toString();
    var filter = weights[scope + "/conv2d/kernel"];
    var bias = weights[scope + "/conv2d/bias"];
    var layer_input = layers[layers.length - 1];
    var rectified = math.leakyRelu(layer_input, 0.2);
    var convolved = conv2d(rectified, filter, bias);
    var scale = weights[scope + "/batch_normalization/gamma"];
    var offset = weights[scope + "/batch_normalization/beta"];
    var normalized = batchnorm(convolved, scale, offset);
    layers.push(normalized);
  }

  for (var i = 8; i >= 2; i--) {
    if (i == 8) {
      var layer_input = layers[layers.length - 1];
    } else {
      var skip_layer = i - 1;
      var layer_input = math.concat3D(
        layers[layers.length - 1],
        layers[skip_layer],
        2
      );
    }
    var rectified = math.relu(layer_input);
    var scope = "generator/decoder_" + i.toString();
    var filter = weights[scope + "/conv2d_transpose/kernel"];
    var bias = weights[scope + "/conv2d_transpose/bias"];
    var convolved = deconv2d(rectified, filter, bias);
    var scale = weights[scope + "/batch_normalization/gamma"];
    var offset = weights[scope + "/batch_normalization/beta"];
    var normalized = batchnorm(convolved, scale, offset);
    // missing dropout
    layers.push(normalized);
  }

  var layer_input = math.concat3D(layers[layers.length - 1], layers[0], 2);
  var rectified = math.relu(layer_input);
  var filter = weights["generator/decoder_1/conv2d_transpose/kernel"];
  var bias = weights["generator/decoder_1/conv2d_transpose/bias"];
  var convolved = deconv2d(rectified, filter, bias);
  var rectified = math.tanh(convolved);
  layers.push(rectified);

  var output = layers[layers.length - 1];
  var deprocessed_output = deprocess(output);

  return deprocessed_output;
}

export const fetch_weights = async path => {
  try {
    if (weights_cache[path]) {
      return weights_cache[path];
    }
    let res = await axios.get(path, {
      responseType: "arraybuffer"
    });
    let buf = res.data;
    let parts = [];
    let offset = 0;
    while (offset < buf.byteLength) {
      let b = new Uint8Array(buf.slice(offset, offset + 4));
      offset += 4;
      let len = (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3];
      parts.push(buf.slice(offset, offset + len));
      offset += len;
    }

    let shapes = JSON.parse(new TextDecoder("utf8").decode(parts[0]));
    let index = new Float32Array(parts[1]);
    let encoded = new Uint8Array(parts[2]);

    // decode using index
    let arr = new Float32Array(encoded.length);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = index[encoded[i]];
    }

    let weights = {};
    offset = 0;
    for (let i = 0; i < shapes.length; i++) {
      let shape = shapes[i].shape;
      let size = shape.reduce((total, num) => total * num);
      let values = arr.slice(offset, offset + size);
      let dlarr = dl.Array1D.new(values, "float32");
      weights[shapes[i].name] = dlarr.reshape(shape);
      offset += size;
    }
    weights_cache[path] = weights;

    return weights;
  } catch (e) {
    console.log(e);
  }
};

export const output = async (input, output, path, size) => {
  let weights = await fetch_weights(path);

  let SIZE = 256;
  let canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  let ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.drawImage(input, 0, 0, canvas.width, canvas.height);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (var i = 0; i < imageData.data.length; i += 4) {
    // 当该像素是透明的，则设置成白色
    if (imageData.data[i + 3] == 0) {
      imageData.data[i] = 255;
      imageData.data[i + 1] = 255;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = 255;
    }
  }

  let input_uint8_data = imageData.data;
  let input_float32_data = Float32Array.from(input_uint8_data, x => x / 255);

  const math = dl.ENV.math;
  math.startScope();
  let input_rgba = dl.Array3D.new(
    [SIZE, SIZE, 4],
    input_float32_data,
    "float32"
  );
  let input_rgb = math.slice3D(input_rgba, [0, 0, 0], [SIZE, SIZE, 3]);

  let output_rgb = model(input_rgb, weights);

  let alpha = dl.Array3D.ones([SIZE, SIZE, 1]);
  let output_rgba = math.concat3D(output_rgb, alpha, 2);

  let output_float32_data = await output_rgba.getValuesAsync();

  let output_uint8_data = Uint8ClampedArray.from(
    output_float32_data,
    x => x * 255
  );

  let result = document.createElement("canvas");
  result.width = SIZE;
  result.height = SIZE;

  result
    .getContext("2d")
    .putImageData(new ImageData(output_uint8_data, SIZE, SIZE), 0, 0);

  output.getContext("2d").drawImage(result, 0, 0, input.width, input.height);

  math.endScope();
};
