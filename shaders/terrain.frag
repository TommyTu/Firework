#version 400 core
#define N(h) fract(cos(vec4(6,9,1,0)*h) * 9e2)
#define N1(h) 0.5f * fract(cos(401*h) * 9e2)

out vec4 fragColor;

uniform float iTime;
uniform vec2 resolution;

uniform sampler2D iChannel0;


const float box_x = 20.;
const float box_y = 0.2;

const float PI = 3.14159265;
const float MAX_RAYMARCH_DIST = 150.0;
const float MIN_RAYMARCH_DELTA = 0.00015;
const float GRADIENT_DELTA = 0.015;

const int RAY_ITER  = 30;
const int RAY_ITER_BW = 20;
const float AO_SMALL_PREC = 0.003;
const float AO_DIST = 0.1;
const int AO_RAY_ITER = 5;
const int NUM_RAY_AO = 8;
const int NOISE_OCTAVES = 7;

float fbm(vec2 p);

bool terrainMoving = false;
bool rotation = false;

float map(vec2 p)
{
    if(terrainMoving)
        p += iTime * vec2(0.1, 0.05);

    //  *** Choose the map function here ***
    return fbm(p);
}


float f(vec3 p)
{
    float h=fbm(p.xz);
    h+=smoothstep(-.5,1.5,h);
    h=p.y-h;
    return h;
}

vec3 getNormal(vec3 p, float t)
{
    vec3 eps=vec3(0.001*t,0.0,0.0);
    vec3 n=vec3(f(p-eps.xyy)-f(p+eps.xyy),
                2.0*eps.x,
                f(p-eps.yyx)-f(p+eps.yyx));

    return normalize(n);
}

vec3 noised( in vec2 x )
{
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f*f*(3.0-2.0*f);
        float a = texture(iChannel0,(p+vec2(0.5,0.5))/256.0,-100.0).x;
        float b = texture(iChannel0,(p+vec2(1.5,0.5))/256.0,-100.0).x;
        float c = texture(iChannel0,(p+vec2(0.5,1.5))/256.0,-100.0).x;
        float d = texture(iChannel0,(p+vec2(1.5,1.5))/256.0,-100.0).x;
        return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,
                                6.0*f*(1.0-f)*(vec2(b-a,c-a)+(a-b-c+d)*u.yx));
}

float noise( in vec2 x )
{
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f*f*(3.0-2.0*f);
    float a = texture(iChannel0,(p+vec2(0.5,0.5))/256.0,-100.0).x;
    float b = texture(iChannel0,(p+vec2(1.5,0.5))/256.0,-100.0).x;
    float c = texture(iChannel0,(p+vec2(0.5,1.5))/256.0,-100.0).x;
    float d = texture(iChannel0,(p+vec2(1.5,1.5))/256.0,-100.0).x;
    return mix(a, b, u.x) +
                (c - a)* u.y * (1.0 - u.x) +
                (d - b) * u.x * u.y;
}


float fbm(vec2 p)
{

    p = p*3.0+vec2(10.0,-1.0);
    float r = 0.0;
    float a = 1.0;
    for( int i=0; i<NOISE_OCTAVES; i++ )
    {
        float n = noise(p);
        r+=a*n;
        a *= 0.5;
        p = p*2.0;
    }
    return 0.1*r;

/*
    p = p*0.09+vec2(0.,-0.9);//p *= 0.09;
    float f=0.;
    float freq=4.0;
    float amp=1.0;
    for(int i=0;i<NOISE_OCTAVES;++i)
      {
          f+=noise(p*freq)*amp;
          amp*=0.5;
          freq*=1.79;
      }

      return f;
      */
}


vec2 boxRay(in vec3 ro, in vec3 rd)
{
    vec3 i_p = (vec3(box_x, box_y, box_x) - ro ) / rd;
    vec3 i_m = (-vec3(box_x,0.5*box_y, box_x) - ro ) / rd;

    vec3 vmin = min(i_p, i_m);
    vec3 vmax = max(i_p, i_m);

    // min, max
    return vec2(max(max(vmin.x, vmin.y), vmin.z),min(min(vmax.x, vmax.y), vmax.z));
}

float castray(in vec3 ro, in vec3 rd)
{

    vec2 box = boxRay(ro, rd);

    if(box.x > box.y || box.y <= 0.0)
        return -1.0;

    float mint = box.x;
    float maxt = box.y;

    vec3 first = ro + rd*box.x;

    if(map(first.xz) > first.y)
        return -2.0;



    float delt = (maxt-mint) / float(RAY_ITER);

    float lh = 0.0;
    float ly = 0.0;
    float t = mint;
    vec3  p;
    for(int i = 0; i<RAY_ITER; i++)
    {
        t+= delt;
        p = ro + rd*t;
        float h = map( p.xz );
        if( p.y < h )
        {
            delt = delt / float(RAY_ITER_BW);
            for(int j = 0; j<RAY_ITER_BW; j++)
            {
                t-= delt;
                p = ro + rd*t;
                        h = map( p.xz );
                if( p.y > h )
                        return t - delt + delt*(lh-ly)/(p.y-ly-h+lh);
                lh = h;
                        ly = p.y;
            }
        }
        lh = h;
        ly = p.y;

    }

    return -1.0;

}



vec4 lighting(vec3 ray_start, vec3 ray_dir, vec3 light1_pos, vec3 skycolor_now) {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    float map_p;
    int iterations;
    float dist = castray(ray_start, ray_dir); // -2 dress, -1 bg, terrain
    if (dist > 0.0) {
        vec3 p = ray_start + ray_dir * dist;
        vec3 light1_dir = normalize(light1_pos - p);
        //vec3 light2_dir = normalize(light2_pos - p);
        vec3 n = getNormal(ray_start + dist * ray_dir, dist);
        vec3 ambient = vec3(0.0);//skycolor_now * 0.1;
        vec3 diffuse1 = vec3(0.15, 0.15, 0.07) /2.0 * max(0.0, dot(light1_dir, n)  * 4.5);
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

vec4 firework_lighting(vec3 ray_start, vec3 ray_dir, vec3 light1_pos, vec3 skycolor_now) {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    float map_p;
    int iterations;
    float dist = castray(ray_start, ray_dir); // -2 dress, -1 bg, terrain
    if (dist > 0.0) {
        vec3 p = ray_start + ray_dir * dist;
        vec3 light1_dir = normalize(light1_pos - p);
        //vec3 light2_dir = normalize(light2_pos - p);
        vec3 n = getNormal(ray_start + dist * ray_dir, dist);
//        vec3 ambient = vec3(0.0);//skycolor_now * 0.1;
//        vec3 diffuse1 = 0vec3(0.15, 0.15, 0.07) /2.0 * max(0.0, dot(light1_dir, n)  * 4.5);
        vec3 r = reflect(light1_dir, n);
        //vec3 r2 = reflect(light2_dir, n);
        // modify for changing reflection color
        vec3 specular1 = vec3(1.0, 1.0, 1.0) * (0.8 * pow(max(0.0, dot(r, ray_dir)), 400.0));
        //vec3 specular2 = vec3(1.0, 0.0, 0.0) * (0.8 * pow(max(0.0, dot(r2, ray_dir)), 2000.0)) * (5.0/dist);
        float fog = min(max(p.z * 0.07, 0.0), 1.0);
        //color.rgb = (vec3(0.6,0.6,1.0) * diffuse1 + specular1 + specular2 + ambient)  * (1.0 - fog) + skycolor_now * fog;
        color.rgb = specular1  * (1.0 - fog) ;//+ skycolor_now * fog;
    } else {
        color.rgb = vec3(0.0); //skycolor_now.rgb;  // sky (above water) = sky + moon
    }
    return color;

}

vec3 render(in vec3 ro, in vec3 rd)
{
    vec3 light1_pos = vec3(0, 100.f, 500.0);

    // skycolor
    float sunperc = pow(max(0.0, min(dot(rd, normalize(light1_pos)), 1.0)), 190.0 + max(0.0,light1_pos.y * 4.3));
    float middayperc = 0.15;

    // modify for change scene color
    vec3 suncolor = (1.0 - max(0.0, middayperc)) * vec3(middayperc + 0.8, middayperc + 0.8, middayperc + 0.8) + max(0.0, middayperc) * vec3(0.8, 0.8, 0.6) * 4.0;
    vec3 skycolor = vec3(middayperc + 0.1, middayperc + 0.1, middayperc + 0.1); // 0, 0.1, 0.3 -> blue
    vec3 skycolor_now = suncolor * sunperc + (skycolor * (middayperc * 1.6 + 0.5)) * (1.0 - sunperc);

    //vec3 bg_color = mix(vec3(0.3, 0.3, 0.3), vec3(0.2, 0.2, 0.4), gl_FragCoord.y/resolution.y);
    vec4 color = lighting(ro, rd, light1_pos, skycolor_now);

    // firework
    vec4 o = vec4(0);
    vec2 u = gl_FragCoord.xy / resolution.xy;
    vec4 p;
    float e, d = -2;
    for(float i = 0; i < 5.; i++) {
//        vec4 cur_o = vec4(0.0);
        if (p.y < 1) {
            for(d=0.;d<100.;d++) {
                // vec4 cycle = N(d*i)-0.5;
//              if(pow(cycle.x,2) + pow(cycle.y,2) > 0.25) continue;
                //vec4 particle = p-e*cycle;
                //vec2 dist = u - particle.xy;
                float r = N1(d*i);
                float theta = 2 * PI * d / 100;
                vec2 cycle = vec2(r*cos(theta), r*sin(theta) );
                vec2 particle = p.xy - e * cycle;
                o += (p*(1.-e) / 3e3) / length(u - particle);
            }
            vec3 fire_pos = vec3(resolution.x* p.x, p.y * resolution.y, 500);
            color += firework_lighting(ro,rd,fire_pos,(p*(1.-e)).rgb);
            //o += cur_o;
        }
        d = floor(e = 0.6*i*9.1+iTime);
        p = N(d);
        p.y += 0.7 ;
        e -= d;
    }
    color = color + o;


    return color.xyz;

}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr )
{
        vec3 cw = normalize(ta-ro);
        vec3 cp = vec3(sin(cr), cos(cr),0.0);
        vec3 cu = normalize( cross(cw,cp) );
        vec3 cv = normalize( cross(cu,cw) );
    return mat3( cu, cv, cw );
}

vec3 camerapath(float t)
{
    vec3 p=vec3(-13.0+3.5*cos(t),3.3,-1.1+2.4*cos(2.4*t+2.0));
        return p;
}

void main()
{
    vec2 q = gl_FragCoord.xy/resolution.xy;
    vec2 p = -1.0+2.0*q;
    p.x *= resolution.x/resolution.y;
    vec2 mo = vec2(1.0, 0.0); //iMouse.xy/resolution.xy; -> control ray start by mouse
    float time = 0.0;
    if(rotation)
        time = iTime;

    // camera
    //vec3 ro = vec3(0.,1.,0.);
    //vec3 ro = vec3(-13.0+3.5*cos(time),3.3,-1.1+2.4*cos(2.4*time+2.0));
    //vec3 ta = vec3(0.0, -0.5, 0.0);
    vec3 ta=camerapath(2.75*0.2+0.3);
    ta.y-=0.2;
    vec3 ro=camerapath(2.75*0.2);

    vec3 cf = normalize(ta-ro);
    vec3 cs = normalize(cross(cf,vec3(0.0,1.0,0.0)));
    vec3 cu = normalize(cross(cs,cf));
    vec3 rd = normalize(p.x*cs + p.y*cu + 1.5*cf);  // transform from view to world

    // camera-to-world transformation
    //mat3 ca = setCamera( ro, ta, 0.0 );

    // ray direction
    //vec3 rd = ca * normalize( vec3(p.xy,2.0) );
    vec3 col = render(ro, rd);
    col = pow( col, vec3(0.4745) );

    fragColor=vec4( col, 1.0 );
}
