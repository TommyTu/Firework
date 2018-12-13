#version 400 core
#define N(h) fract(cos(vec4(6,9,1,0)*h) * 9e2)
#define N1(h) 0.5f * fract(cos(401*h) * 9e2)

out vec4 fragColor;

uniform float iTime;
uniform vec2 resolution;

uniform sampler2D iChannel0;


const float box_x = 10.;
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

float elevated(vec2 p);
float fbm(vec2 p);

bool terrainMoving = false;
bool rotation = true;

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


vec3 noised( in vec2 x );


float elevated(vec2 p)
{
        const mat2 m2 = mat2(0.8,-0.6,0.6,0.8);

    p = p*3.0+vec2(10.0,-1.0);

    float a = 0.0;
    float b = 1.0;
        vec2  d = vec2(0.0);
    for( int i=0; i<NOISE_OCTAVES; i++ )
    {
        vec3 n = noised(p);
        d += n.yz;
        a += b*n.x/(1.0+dot(d,d));
                b *= 0.5;
        p = m2*p*2.0;
    }
    return 0.1*a;
}

float fbm(vec2 p)
{
    p = p*3.0+vec2(10.0,-1.0);
    float r = 0.0;
    float a = 1.0;
    for( int i=0; i<NOISE_OCTAVES; i++ )
    {
        vec3 n = noised(p);
        r+=a*n.x;
        a *= 0.5;
        p = p*2.0;
    }
    return 0.3*r;
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

//oat ao_t0;
float ao_factor;
/*id compute_ao_t0()
{
    ao_t0 = AO_DIST / pow(1.0 + AO_DT_FACTOR, float(AO_RAY_ITER-1));
}*/
void compute_ao_factor()
{
    ao_factor = pow(AO_DIST / AO_SMALL_PREC , 1.0/float(AO_RAY_ITER-1))-1.0;
}

// return lowest ray seeing the sky (angle proportion)
// rd must be normalized and null in y
float aoray(in vec3 ro, in vec3 rd)
{

    float maxt = AO_DIST;

    float t = AO_SMALL_PREC;
    vec3 d = rd; // cur highest dir

    for(int i = 0; i<AO_RAY_ITER; i++)
    {
        vec3 p = ro + rd*t;
        p.y = map( p.xz ); // p design the map point
        float t_d = t/dot(rd, d); // compute dist between vertical at p and ro alog dir
        vec3 p2 = ro+d * t_d; // and deduce point along d
        if( p2.y < p.y )
        {
            d = normalize(p-ro);
        }
        t +=  ao_factor * t;
    }

    return acos(d.y)/3.141593;

}



float ao(vec3 p)
{
    float illum = 0.0;
    float th = 0.0;
    float dth = float(NUM_RAY_AO) *0.1591549430; // 1 / (2pi)
    for(int i = 0; i<NUM_RAY_AO; i++)
    {
        illum += aoray(p, vec3(cos(th), 0.0, sin(th)));
        th += dth;
    }
    return illum / float(NUM_RAY_AO)*2.0-1.0;
}


// key is javascript keycode
bool ReadKey( int key, bool toggle )
{
    float keyVal = texture( iChannel0, vec2( (float(key)+.5)/256.0, toggle?.75:.25 ) ).x;
    return (keyVal>.5)?true:false;
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
        color.rgb = (vec3(0.6,0.6,1.2) * diffuse1 + specular1 + ambient)  * (1.0 - fog);// + skycolor_now * fog;
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
        color.rgb = specular1  * (1.0 - fog);// + skycolor_now * fog;
    } else {
        color.rgb = vec3(0.0); //skycolor_now.rgb;  // sky (above water) = sky + moon
    }
    return color;

}

vec3 render(in vec3 ro, in vec3 rd)
{
    vec3 light1_pos = vec3(-80, 100.f, 1000.0);

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
        //if (u.y < 0.2) o = vec4(0.0);
        //if(u.y<N(ceil(u.x*i+d+e)).x*.4) o-=o*u.y;

    color = color + o;


    return color.xyz;
//    if(d<-1.5) // terrain "dress"
//        return vec3(0.1);
//    else if(d<0.0) // background
//    {
//        return mix(vec3(0.3, 0.3, 0.3), vec3(0.2, 0.2, 0.4), gl_FragCoord.y/resolution.y);
//    }

//    vec3 p = ro + d*rd;
//    //return ao(p) * mix(vec3(0.5), vec3(0.8), p.y/0.2);
//    return  mix(vec3(0.1, 0.09, 0.08), vec3(0.9, 0.8, 0.7), 0.75*ao(p) + 0.25*min(1.0, p.y/0.2)) ;

}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr )
{
        vec3 cw = normalize(ta-ro);
        vec3 cp = vec3(sin(cr), cos(cr),0.0);
        vec3 cu = normalize( cross(cw,cp) );
        vec3 cv = normalize( cross(cu,cw) );
    return mat3( cu, cv, cw );
}

void main()
{
    //mpute_ao_t0();
    compute_ao_factor();
    vec2 q = gl_FragCoord.xy/resolution.xy;
    vec2 p = -1.0+2.0*q;
    p.x *= resolution.x/resolution.y;
    vec2 mo = vec2(1.0, 0.0); //iMouse.xy/resolution.xy; -> control ray start by mouse
    float time = 0.0;
    terrainMoving = ReadKey(65, true); // key 'a'
    rotation = !ReadKey(82, true); // key 'r'
    if(rotation)
        time = iTime;

    // camera
    vec3 ro = 0.6*vec3( 3.5*cos(0.1*time + 6.0*mo.x), 2.0 + 4.0*mo.y, 3.5*sin(0.1*time + 6.0*mo.x) );
    vec3 ta = vec3(0.0, -0.5, 0.0);

    // camera-to-world transformation
    mat3 ca = setCamera( ro, ta, 0.0 );

    // ray direction
    vec3 rd = ca * normalize( vec3(p.xy,2.0) );
    vec3 col = render(ro, rd);
    col = pow( col, vec3(0.4745) );

    fragColor=vec4( col, 1.0 );
}



