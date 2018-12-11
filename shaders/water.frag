#version 400 core
#define N(h) fract(sin(vec4(6,9,1,0)*h) * 9e2)

out vec4 fragColor;

uniform float iTime;
uniform vec2 resolution;

const bool USE_MOUSE = true; // Set this to true for God Mode :)

const float PI = 3.14159265;
const float MAX_RAYMARCH_DIST = 150.0;
const float MIN_RAYMARCH_DELTA = 0.00015;
const float GRADIENT_DELTA = 0.015;
float waveHeight1 = 0.005;
float waveHeight2 = 0.004;
float waveHeight3 = 0.001;
vec2 mouse;

// --------------------- START of SIMPLEX NOISE
//
// Description : Array and textureless GLSL 2D simplex noise function.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x*34.0)+1.0)*x);
}

float snoise(vec2 v)
  {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
// First corner
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);

// Other corners
  vec2 i1;
  //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
  //i1.y = 1.0 - i1.x;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  // x0 = x0 - 0.0 + 0.0 * C.xx ;
  // x1 = x0 - i1 + 1.0 * C.xx ;
  // x2 = x0 - 1.0 + 2.0 * C.xx ;
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

// Permutations
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                + i.x + vec3(0.0, i1.x, 1.0 ));

  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;

// Gradients: 41 points uniformly over a line, mapped onto a diamond.
// The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

// Normalise gradients implicitly by scaling m
// Approximation of: m *= inversesqrt( a0*a0 + h*h );
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

// Compute final noise value at P
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// --------------------- END of SIMPLEX NOISE


float map(vec3 p) {
        return p.y + (0.5 + waveHeight1 + waveHeight2 + waveHeight3)
                + snoise(vec2(p.x + iTime * 0.4, p.z + iTime * 0.6)) * waveHeight1
                + snoise(vec2(p.x * 1.6 - iTime * 0.4, p.z * 1.7 - iTime * 0.6)) * waveHeight2
                + snoise(vec2(p.x * 6.6 - iTime * 1.0, p.z * 2.7 + iTime * 1.176)) * waveHeight3;
}

vec3 gradientNormalFast(vec3 p, float map_p) {
    return normalize(vec3(
        map_p - map(p - vec3(GRADIENT_DELTA, 0, 0)),
        map_p - map(p - vec3(0, GRADIENT_DELTA, 0)),
        map_p - map(p - vec3(0, 0, GRADIENT_DELTA))));
}

float intersect(vec3 p, vec3 ray_dir, out float map_p, out int iterations) {
        iterations = 0;
        if (ray_dir.y >= 0.0) { return -1.0; } // to see the sea you have to look down

        float distMin = (- 0.5 - p.y) / ray_dir.y;
        float distMid = distMin;
        for (int i = 0; i < 50; i++) {
                //iterations++;
                distMid += max(0.05 + float(i) * 0.002, map_p);
                map_p = map(p + ray_dir * distMid);
                if (map_p > 0.0) {
                        distMin = distMid + map_p;
                } else {
                        float distMax = distMid + map_p;
                        // interval found, now bisect inside it
                        for (int i = 0; i < 10; i++) {
                                //iterations++;
                                distMid = distMin + (distMax - distMin) / 2.0;
                                map_p = map(p + ray_dir * distMid);
                                if (abs(map_p) < MIN_RAYMARCH_DELTA) return distMid;
                                if (map_p > 0.0) {
                                        distMin = distMid + map_p;
                                } else {
                                        distMax = distMid + map_p;
                                }
                        }
                        return distMid;
                }
        }
        return distMin;
}


vec4 lighting(vec3 ray_start, vec3 ray_dir, vec3 light1_pos, vec3 skycolor_now) {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    float map_p;
    int iterations;
    float dist = intersect(ray_start, ray_dir, map_p, iterations);
    if (dist > 0.0) {
        vec3 p = ray_start + ray_dir * dist;
        vec3 light1_dir = normalize(light1_pos - p);
        //vec3 light2_dir = normalize(light2_pos - p);
        vec3 n = gradientNormalFast(p, map_p);
            vec3 ambient = skycolor_now * 0.1;
        vec3 diffuse1 = vec3(0.55, 0.55, 0.3) /2.0 * max(0.0, dot(light1_dir, n)  * 4.5);
        vec3 r = reflect(light1_dir, n);
        //vec3 r2 = reflect(light2_dir, n);

        // modify for changing reflection color
            vec3 specular1 = vec3(1.0, 1.0, 1.0) * (0.8 * pow(max(0.0, dot(r, ray_dir)), 400.0));
        //vec3 specular2 = vec3(1.0, 0.0, 0.0) * (0.8 * pow(max(0.0, dot(r2, ray_dir)), 2000.0)) * (5.0/dist);
            float fog = min(max(p.z * 0.07, 0.0), 1.0);
        //color.rgb = (vec3(0.6,0.6,1.0) * diffuse1 + specular1 + specular2 + ambient)  * (1.0 - fog) + skycolor_now * fog;
        color.rgb = (vec3(0.6,0.6,1.2) * diffuse1 + specular1 + ambient)  * (1.0 - fog) + skycolor_now * fog;
    } else {
        color.rgb = skycolor_now.rgb;  // sky (above water) = sky + moon
    }
        return color;
}


vec4 firework_lighting(vec3 ray_start, vec3 ray_dir, vec3 light1_pos, vec3 firework_color) {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    float map_p;
    int iterations;
    float dist = intersect(ray_start, ray_dir, map_p, iterations);
    if (dist > 0.0) {
        vec3 p = ray_start + ray_dir * dist;
        vec3 light1_dir = normalize(light1_pos - p);
        //vec3 light2_dir = normalize(light2_pos - p);
        vec3 n = gradientNormalFast(p, map_p);
        vec3 diffuse1 = vec3(0.55, 0.55, 0.3) /2.0 * max(0.0, dot(light1_dir, n)  * 4.5);
        vec3 r = reflect(light1_dir, n);
        //vec3 r2 = reflect(light2_dir, n);

        // modify for changing reflection color
        vec3 specular1 = firework_color.rgb * (0.8 * pow(max(0.0, dot(r, ray_dir)), 400.0));
        //vec3 specular2 = vec3(1.0, 0.0, 0.0) * (0.8 * pow(max(0.0, dot(r2, ray_dir)), 2000.0)) * (5.0/dist);
        float fog = min(max(p.z * 0.07, 0.0), 1.0);
        //color.rgb = (vec3(0.6,0.6,1.0) * diffuse1 + specular1 + specular2 + ambient)  * (1.0 - fog) + skycolor_now * fog;
        color.rgb = specular1 * (1.0 - fog);// + skycolor_now * fog;
    } else {
        color.rgb = vec3(0.0);  // sky (above water) = sky + moon
    }
        return color;
}


void main(){
        //mouse = vec2(iMouse.x / iResolution.x, iMouse.y / iResolution.y);
    mouse = vec2(0.8, 1.0);

    float waveHeight = 5.0 ;//: cos(iTime * 0.03) * 1.2 + 1.6;
    waveHeight1 *= waveHeight;
    waveHeight2 *= waveHeight;
    waveHeight3 *= waveHeight;
//        gl_FragCoord
//        resolution passed in as uniform
    vec2 position = gl_FragCoord.xy/resolution.xy; // vec2((gl_FragCoord.x + 1.0) / 2.0 , (gl_FragCoord.y + 1.0) / 2.0);
    position.x = position.x * resolution.x/resolution.y;
    position = position *2.0 -  1.0;

    // modify for moving camera
    vec3 ray_start = vec3(-0.8, 0.0, -1.6);//vec3((sin(iTime) + 1.0) / 2.0, 0.0, min(-1.0, cos(iTime) + (sin(iTime + 3.1415) + cos(iTime + 3.1415))/1.414 - 2.0)) ; ///
    vec3 ray_dir = normalize(vec3(position,0) - ray_start);
    ray_start.y = 1.0; //cos(iTime * 0.5) * 0.2 - 0.25 + sin(iTime * 2.0) * 0.05;

    const float dayspeed = 0.04;
    float subtime = max(-0.16, sin(iTime * dayspeed) * 0.2);
    float middayperc = mouse.y * 0.3 - 0.15 ; //max(0.0, sin(subtime));

    // modify to change sun position, keep it stayed!
    vec3 light1_pos = vec3(-80, middayperc * 2000.0, 1000.0);//cos(subtime * dayspeed) * 200.0);

    //vec3 light2_pos = vec3(500, middayperc * 2000.0, 1000.0); //cos(subtime * dayspeed) * 200.0);

    float sunperc = pow(max(0.0, min(dot(ray_dir, normalize(light1_pos)), 1.0)), 190.0 + max(0.0,light1_pos.y * 4.3));

    // modify for change scene color
    vec3 suncolor = (1.0 - max(0.0, middayperc)) * vec3(middayperc + 0.8, middayperc + 0.8, middayperc + 0.8) + max(0.0, middayperc) * vec3(0.8, 0.8, 0.6) * 4.0;
    vec3 skycolor = vec3(middayperc + 0.1, middayperc + 0.1, middayperc + 0.1); // 0, 0.1, 0.3 -> blue
    vec3 skycolor_now = suncolor * sunperc + (skycolor * (middayperc * 1.6 + 0.5)) * (1.0 - sunperc);

    vec4 color = lighting(ray_start, ray_dir, light1_pos, skycolor_now);
    // firework
    vec4 o = vec4(0);
    vec2 u = gl_FragCoord.xy / resolution.xy;
    vec4 p;
    float e, d = -2;
    for(float i = 0; i < 3.; i++) {
//        vec4 cur_o = vec4(0.0);
        if (p.y < 1) {
            for(d=0.;d<50.;d++) {
                o += (p*(1.-e) / 1e3) / length(u-(p-e*(N(d*i)-.5)).xy);
            }
            vec3 fire_pos = vec3(resolution.x* p.x, p.y * resolution.y, 500);
            color += firework_lighting(ray_start,ray_dir,fire_pos,(p*(1.-e)).rgb);
            //o += cur_o;
        }
        d = floor(e = 0.6*i*9.1+iTime);
        p = N(d);
        p.y += 0.5;
        e -= d;
    }
        //if (u.y < 0.2) o = vec4(0.0);
        //if(u.y<N(ceil(u.x*i+d+e)).x*.4) o-=o*u.y;

    fragColor = color + o;


     /**
       TODO:
       1. firework light ->  water ** 60%
       2. firework 3d / realistic (eye? + ray marching? move ? )   ****
       3. camera motion (firework position): 2d position -> simulate 3d motion ***
       4. high dynamic range ?  ***
       *5. frequency?
       */
}
