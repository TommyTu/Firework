#version 400 core
#define N(h) fract(cos(vec4(6,9,1,0)*h) * 9e2)
#define N1(h) 0.5f * fract(cos(401*h) * 9e2)

out vec4 fragColor;

uniform int useCameraMotion;
uniform int useDispMapping;

uniform float iTime;
uniform vec2 resolution;
uniform vec2 fireData;
uniform vec3 skyColor;


uniform sampler2D iChannel0;


const float box_x = 15.;
const float box_y = 0.2;

const float PI = 3.14159265;
const float MAX_RAYMARCH_DIST = 150.0;
const float MIN_RAYMARCH_DELTA = 0.00015;
const float GRADIENT_DELTA = 0.015;

const int RAY_ITER  = 30;
const int RAY_ITER_BW = 3;
const int NUM_RAY_AO = 8;
const int NOISE_OCTAVES = 7;

float fbm(vec2 p);

float map(vec2 p)
{
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
        float a = texture(iChannel0,(p+vec2(0.5,0.5))/96.0,-100.0).x;
        float b = texture(iChannel0,(p+vec2(1.5,0.5))/96.0,-100.0).x;
        float c = texture(iChannel0,(p+vec2(0.5,1.5))/96.0,-100.0).x;
        float d = texture(iChannel0,(p+vec2(1.5,1.5))/96.0,-100.0).x;
        return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,
                                6.0*f*(1.0-f)*(vec2(b-a,c-a)+(a-b-c+d)*u.yx));
}

float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec3 random_noised(in vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f*f*(3.0-2.0*f);
        float a = rand(p + vec2(0.5, 0.5));
        float b = rand(p + vec2(1.5,0.5));
        float c = rand(p + vec2(0.5, 1.5));
        float d = rand(p + vec2(1.5, 1.5));
        return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,
                                6.0*f*(1.0-f)*(vec2(b-a,c-a)+(a-b-c+d)*u.yx));
}


float fbm(vec2 p)
{
    if (useDispMapping == 0)
        return 0;

    p = p*3.0+vec2(10.0,-1.0);
    float r = 0.0;
    float a = 1.0;
    for( int i=0; i<NOISE_OCTAVES; i++)
    {
        float n ;
//        if (useDispMapping == 1)
        n = noised(p).x;
//        else
//            n = random_noised(p).x;
        r+=a*n;
        a *= 0.5;
        p = p*2.0;
    }


    return 0.15*r;
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


vec4 lighting(vec3 ray_start, vec3 ray_dir, float dist, float map_p, vec3 light1_pos, vec3 skycolor_now, int isFirework) {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    if (dist > 0.0) {
        vec3 p = ray_start + ray_dir * dist;
        vec3 light1_dir = normalize(light1_pos - p);
        vec3 n = getNormal(ray_start + dist * ray_dir, dist);
        vec3 ambient = vec3(0.0);
        vec3 diffuse1 = vec3(0.15, 0.15, 0.07) / 2.0 * max(0.0, dot(light1_dir, n)  * 4.5);
        vec3 r = reflect(light1_dir, n);
        float fog = min(max(p.z * 0.07, 0.0), 1.0);
        vec3 specular1;
        if (isFirework == 0) {
            specular1 = vec3(1.0, 1.0, 1.0) * (0.4 * pow(max(0.0, dot(r, ray_dir)), 10.0));
                color.rgb = (vec3(0.6,0.6,1.2) * diffuse1 + specular1 + ambient)  * (1.0 - fog);
        } else {
            specular1 = vec3(1.0, 1.0, 1.0) * (0.8 * pow(max(0.0, dot(r, ray_dir)), 400.0));
            color.rgb = specular1  * (1.0 - fog);
        }
    } else if (isFirework == 0){
        color.rgb = skycolor_now.rgb;  // sky (above water) = sky + moon
    }
    return color;
}

vec3 render(in vec3 ro, in vec3 rd)
{
    vec3 light1_pos = vec3(-80, 200.f, 1000.0);

    // skycolor
    float sunperc = pow(max(0.0, min(dot(rd, normalize(light1_pos)), 1.0)), 190.0 + max(0.0,light1_pos.y * 4.3));

    // modify for change scene color
    vec3 suncolor = 0.85 * vec3(0.95, 0.95, 0.95) + 0.95 * vec3(0.8, 0.8, 0.6) * 4.0;
    vec3 skycolor = skyColor / 255.0f;
    vec3 skycolor_now = suncolor * sunperc + (skycolor * (0.85 * 1.6 + 0.5)) * (1.0 - sunperc);

    // intersect
    float map_p;
    int iterations;
    float dist = castray(ro, rd); // -2 dress, -1 bg, terrain

    vec4 color = lighting(ro, rd, dist, map_p, light1_pos, skycolor_now, 0);

    // firework
    vec4 o = vec4(0);
    vec2 u = gl_FragCoord.xy / resolution.xy;
    vec4 p;
    float e, d = -2;
    for(float i = 0; i < fireData.x; i++) {
        if (p.y < 1) {
            for(d=0.;d<fireData.y;d++) {
                float r = N1(d*i);
                float theta = 2 * PI * d / fireData.y;
                vec2 cycle = vec2(r*cos(theta), r*sin(theta) );
                vec2 particle = p.xy - e * cycle;
                o += (p*(1.-e) / 3e3) / length(u - particle);
            }
            vec3 fire_pos = vec3(resolution.x* p.x, p.y * resolution.y, 500);
            color += lighting(ro, rd, dist, map_p, fire_pos,(p*(1.-e)).rgb, 1);
        }
        d = floor(e = 0.6*i*9.1+iTime);
        p = N(d);
        p.y += 0.7 ;
        e -= d;
    }
    color = color + o;
    vec3 tex_pos = ro + rd * dist;
    if (dist <= 0.f || useDispMapping == 1)
        return color.xyz;
    else
        return color.xyz + (texture(iChannel0, tex_pos.xz).xyz
                            + texture(iChannel0, tex_pos.xz + vec2(0.1, 0.1)).xyz)/2.0;

}

int factorial(int n)
{
    int r = 1;
    for(int i=1; i<=n; i++)
        r *= i;
    return r;
}

float binomial_coff(int n,int k)
{
    float ans = factorial(n) / (factorial(k)*factorial(n-k));
    return ans;
}

vec2 drawBezierGeneralized(vec2 PL[5], int clicks, float t) {
    vec2 P;
    P.x = 0; P.y = 0;
    for (int i = 0; i<clicks; i++)
    {
        P.x = P.x + binomial_coff((clicks - 1), i) * pow(t, i) * pow((1 - t), (clicks - 1 - i)) * PL[i].x;
        P.y = P.y + binomial_coff((clicks - 1), i) * pow(t, i) * pow((1 - t), (clicks - 1 - i)) * PL[i].y;
    }
    return P;
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
    vec2 p = -1.0 + 2.0*q;
    p.x *= resolution.x/resolution.y;
    float time = iTime/5;
    // camera
    //vec3 ro = 0.6*vec3( 3.5*cos(0.1*time), 2.0, 3.5*sin(0.1*time) );
    vec2 PL[5];
    vec3 ro, ta;
    vec2 Bcurve;
    if (mod(int(time), 2) == 0) {
        PL[0] = vec2(3.,0.);
        PL[1] = vec2(2.,1.);
        PL[2] = vec2(1.,0.);
        PL[3] = vec2(0.5, 1.);
        PL[4] = vec2(0.,0.);
    } else {
        PL[0] = vec2(0.,0.);
        PL[1] = vec2(-0.5,1.);
        PL[2] = vec2(-1.,0.);
        PL[3] = vec2(-2, 1.);
        PL[4] = vec2(3.,0.);
    }
    if( useCameraMotion == 1) {
        Bcurve = drawBezierGeneralized(PL, 5, mod(time,1));
        ro = vec3(Bcurve.x, 1.0 - Bcurve.y, Bcurve.y );
    } else {
        ro = vec3(0.0, 1.0, 0.0);
    }
    ta = vec3(-4.0, 0.8, 10.0);

    // camera-to-world transformation
    mat3 ca = setCamera( ro, ta, 0.0 );

    // ray direction
    vec3 rd = ca * normalize( vec3(p.xy,2.0) );
    vec3 col = render(ro, rd);
    col = pow( col, vec3(0.4745) );

    fragColor = vec4( col, 1.0 );
}
