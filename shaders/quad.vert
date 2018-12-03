#version 400 core

layout(location = 0) in vec3 position;

out vec2 fragCoord;

void main() {
    fragCoord = vec2(position);
    gl_Position = vec4(position, 1.0);
}
