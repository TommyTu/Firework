#include "glwidget.h"

#include "cs123_lib/resourceloader.h"
#include "cs123_lib/errorchecker.h"
#include <QMouseEvent>
#include <QWheelEvent>
#include <iostream>
#include <unistd.h>
#include "settings.h"

#include "openglshape.h"
#include "gl/textures/Texture2D.h"
#include "gl/shaders/ShaderAttribLocations.h"
#include "sphere.h"

using namespace CS123::GL;

GLWidget::GLWidget(QGLFormat format, QWidget *parent)
    : QGLWidget(format, parent),
      m_width(width()), m_height(height()),
      m_waterProgram(0),
      m_quad(nullptr), m_sphere(nullptr),
      m_blurFBO1(nullptr), m_blurFBO2(nullptr),
      m_particlesFBO1(nullptr), m_particlesFBO2(nullptr),
      m_firstPass(true), m_evenPass(true), m_numParticles(5000),
      m_angleX(-0.5f), m_angleY(0.5f), m_zoom(4.f)
{
}

GLWidget::~GLWidget()
{
    glDeleteVertexArrays(1, &m_particlesVAO);
}

void GLWidget::initializeGL() {
    ResourceLoader::initializeGlew();
    glEnable(GL_DEPTH_TEST);

    // Set the color to set the screen when the color buffer is cleared.
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);


    m_waterProgram = ResourceLoader::createShaderProgram(
                ":/shaders/water.vert", ":/shaders/water.frag");

    // (triangle strip, 4 vertices, position followed by UVs)
    std::vector<GLfloat> quadData = std::vector<GLfloat>((m_height-1) * (m_width-1) * 18);
    for (int i = 0; i < m_height - 1; i++) {
        for (int j = 0; j < m_width - 1; j++) {
            size_t index = i * (m_width - 1) + j;
            quadData[18 * index] = (2.f * i) / m_height - 1;
            quadData[18 * index + 1] = (2.f * j) / m_width - 1;
            quadData[18 * index + 2] = 0.f;
            quadData[18 * index + 3] = (2.f * (i + 1)) / m_height - 1;
            quadData[18 * index + 4] = (2.f * j) / m_width - 1;
            quadData[18 * index + 5] = 0.f;
            quadData[18 * index + 6] = (2.f * i) / m_height - 1;
            quadData[18 * index + 7] = (2.f * (j+1)) / m_width - 1;
            quadData[18 * index + 8] = 0.f;

            quadData[18 * index + 9] = (2.f * i) / m_height - 1;
            quadData[18 * index + 10] = (2.f * (j+1)) / m_width - 1;
            quadData[18 * index + 11] = 0.f;
            quadData[18 * index + 12] = (2.f * (i + 1)) / m_height - 1;
            quadData[18 * index + 13] = (2.f * j) / m_width - 1;
            quadData[18 * index + 14] = 0.f;
            quadData[18 * index + 15] = (2.f * (i + 1)) / m_height - 1;
            quadData[18 * index + 16] = (2.f * (j + 1)) / m_width - 1;
            quadData[18 * index + 17] = 0.0;
        }
    }
    m_quad = std::make_unique<OpenGLShape>();
    m_quad->setVertexData(&quadData[0], quadData.size(), VBO::LAYOUT_TRIANGLES, (m_height-1) * (m_width-1) * 6);
    m_quad->setAttribute(ShaderAttrib::POSITION, 3, 0, VBOAttribMarker::DATA_TYPE::FLOAT, false);
    //m_quad->setAttribute(ShaderAttrib::TEXCOORD0, 2, 3*sizeof(GLfloat), VBOAttribMarker::DATA_TYPE::FLOAT, false);
    m_quad->buildVAO();

    // We will use this VAO to draw our particles' triangles
    // It doesn't need any data associated with it, so we don't have to make a full VAO instance
    glGenVertexArrays(1, &m_particlesVAO);

    // Print the max FBO dimension.
    GLint maxRenderBufferSize;
    glGetIntegerv(GL_MAX_RENDERBUFFER_SIZE_EXT, &maxRenderBufferSize);
    std::cout << "Max FBO size: " << maxRenderBufferSize << std::endl;
}

void GLWidget::paintGL() {
    glClear(GL_COLOR_BUFFER_BIT);
    switch (settings.mode) {
        case MODE_WATER:
            drawWater();
            update();
            break;
        case MODE_PARTICLES:
            drawParticles();
            update();
            break;
    }
}

void GLWidget::drawWater() {
    static int time = 0;
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glUseProgram(m_waterProgram);
    glUniform1f(glGetUniformLocation(m_waterProgram, "iTime"), time/60.f);
    m_quad -> draw();
    glUseProgram(0);
    time++;
}

void GLWidget::drawParticles() {
    auto prevFBO = m_evenPass ? m_particlesFBO1 : m_particlesFBO2;
    auto nextFBO = m_evenPass ? m_particlesFBO2 : m_particlesFBO1;
    float firstPass = m_firstPass ? 1.0f : 0.0f;
    m_firstPass = false;
    m_evenPass = !m_evenPass;
}

// This is called at the beginning of the program between initializeGL and
// the first paintGL call, as well as every time the window is resized.
void GLWidget::resizeGL(int w, int h) {
    m_width = w;
    m_height = h;
    rebuildMatrices();
}

// Sets the viewport to ensure that {0,0} is always in the center of the viewport
// in clip space, and to ensure that the aspect ratio is 1:1
void GLWidget::setParticleViewport() {
    int maxDim = std::max(m_width, m_height);
    int x = (m_width - maxDim) / 2.0f;
    int y = (m_height - maxDim) / 2.0f;
    glViewport(x, y, maxDim, maxDim);
}

/// Mouse interaction code below.

void GLWidget::mousePressEvent(QMouseEvent *event) {
    m_prevMousePos = event->pos();
}

void GLWidget::mouseMoveEvent(QMouseEvent *event) {
    m_angleX += 3 * (event->x() - m_prevMousePos.x()) / (float) width();
    m_angleY += 3 * (event->y() - m_prevMousePos.y()) / (float) height();
    m_prevMousePos = event->pos();
    rebuildMatrices();
}

void GLWidget::wheelEvent(QWheelEvent *event) {
    m_zoom -= event->delta() / 100.f;
    rebuildMatrices();
}

void GLWidget::rebuildMatrices() {
    m_view = glm::translate(glm::vec3(0, 0, -m_zoom)) *
             glm::rotate(m_angleY, glm::vec3(1,0,0)) *
             glm::rotate(m_angleX, glm::vec3(0,1,0));

    m_projection = glm::perspective(0.8f, (float)width()/height(), 0.1f, 100.f);
    update();
}
