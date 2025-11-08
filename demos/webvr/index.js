/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

async function main() {

  var viewerElement = document.querySelector("#pano");
  var enterVrElement = document.querySelector("#enter-vr");
  var noVrElement = document.querySelector("#no-vr");

  // Create stage and register renderers.
  var stage = new Marzipano.WebGlStage();
  Marzipano.registerDefaultRenderers(stage);

  // Insert stage into the DOM.
  viewerElement.appendChild(stage.domElement());

  // Create geometry.
  var geometry = new Marzipano.CubeGeometry([
    { tileSize: 256, size: 256, fallbackOnly: true },
    { tileSize: 512, size: 512 },
    { tileSize: 512, size: 1024 },
    { tileSize: 512, size: 2048 },
    { tileSize: 512, size: 4096 }
  ]);

  // Create view.
  var limiter = Marzipano.RectilinearView.limit.traditional(4096, 110*Math.PI/180);
  var viewLeft = new WebXrView();
  var viewRight = new WebXrView();

  // Create layers.
  var layerLeft = createLayer(stage, viewLeft, geometry, 'left',
    { relativeWidth: 0.5, relativeX: 0 });
  var layerRight = createLayer(stage, viewRight, geometry, 'right',
    { relativeWidth: 0.5, relativeX: 0.5 });

  // Add layers into stage.
  stage.addLayer(layerLeft);
  stage.addLayer(layerRight);

  // WebXR session and rendering logic
  let xrRefSpace = null;

  let supported = await navigator.xr.isSessionSupported('immersive-vr');
  enterVrElement.style.display = supported ? 'block' : 'none';
  noVrElement.style.display = supported ? 'none' : 'block';

  // Enter WebxR mode when the button is clicked.
  enterVrElement.addEventListener('click', function() {
    if (!navigator.xr) return;
    navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] }).then(onSessionStarted);
  });

  function onSessionStarted(session) {
    let xrSession = session;    
    
    // Set up XRWebGLLayer with Marzipano's WebGL context
    const gl = stage.webGlContext();
    gl.makeXRCompatible().then(() => {
      xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
      xrSession.requestReferenceSpace('local-floor').then(function(refSpace) {
        xrRefSpace = refSpace;
        xrSession.requestAnimationFrame(onXRFrame);
      });
    });
  }

  function onXRFrame(time, frame) {
    let session = frame.session;
    let pose = frame.getViewerPose(xrRefSpace);
    if (!pose) {
      session.requestAnimationFrame(onXRFrame);
      return;
    }

    // Ensure we're rendering to the layer's backbuffer.
    let layer = session.renderState.baseLayer;
    const gl = stage.webGlContext();
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);

    // For stereo, use the first two views (usually left/right)
    if (pose.views.length >= 2) {
      viewLeft.setProjectionFromXRView(pose.views[0]);
      viewRight.setProjectionFromXRView(pose.views[1]);

      let layer = session.renderState.baseLayer;
      let viewportLeft = layer.getViewport(pose.views[0]);
      let viewportRight = layer.getViewport(pose.views[1]);

      // Width of stage is the width for the left and right eyes
      stage.setSize({
        width: viewportLeft.width + viewportRight.width,
        height: viewportLeft.height
      });

    } else if (pose.views.length === 1) {
      viewLeft.setProjectionFromXRView(pose.views[0]);
      viewRight.setProjectionFromXRView(pose.views[0]);
    }

    stage.render();

    session.requestAnimationFrame(onXRFrame);
  }

  function createLayer(stage, view, geometry, eye, rect) {
    var urlPrefix = "//www.marzipano.net/media/music-room";
    var source = new Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + eye + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + eye + "/preview.jpg" });

    var textureStore = new Marzipano.TextureStore(source, stage);
    var layer = new Marzipano.Layer(source, geometry, view, textureStore,
      { effects: { rect: rect }});

    layer.pinFirstLevel();

    return layer;
  }
}

main();