# Final Project
The theme of the project is firework. Two different scenes with firework are shown in the window.

## a. User Instructions
There are two scenes that user can pick: firework over the sea and firework over the terrain. For each scene, user can choose the parameters for the number of fireworks and the number of particles in each firework. The color of the background(sky) can also be dicided with the color bar on window. Displacement mapping and camera motion functions are implemented in the project and the enable/disable options are shown as well.

## b. Design Decisions
1. "old" feature
The feature that is already covered in prior lab is "ray marching". It is implemented to realize the reflection of moon and fireworks on the sea/terrain surfaces.
2. "new" features
(1) displacement mapping
In the scene of terrain, displacement mapping is implemented to show the depth of the terrain surface. Function "noised" in the terrain.frag is responsible for the mapping.
(2) camera motion
There are two kinds of path for camera motion: circle and piecewise Bezier curve. For the circle path, the position of camera.y is fixed and x,z are on on circle. For piecewise Bezier curve, 4 points are fixed and the curve is drawn from those points with the Bezier curve formula.
(3) complex environment -- ocean wave
The ocean wave is realized with noise functions. Time is one of the parameters for the noise function so that the wave is moving.
3. others
(1) firework
The fireworks are drawn with random locations and random colors. The number of fireworks at the same time and the number of particles for each firework are decided by user. the further the particle to the central booming point, the darker the color is.
## c. References
1. Shadertoy examples:
(1) terrain: 
https://www.shadertoy.com/view/lt2XDm
https://www.shadertoy.com/view/XtsGR2
(2) firework:
https://www.shadertoy.com/view/ldBfzw
2. noise functions
(1)Description : Array and textureless GLSL 2D simplex noise function.
        Author : Ian McEwan, Ashima Arts.
    Maintainer : ijm
       Lastmod : 20110822 (ijm)
       License : Copyright (C) 2011 Ashima Arts. All rights reserved.
                 Distributed under the MIT License. See LICENSE file.
                 https://github.com/ashima/webgl-noise
