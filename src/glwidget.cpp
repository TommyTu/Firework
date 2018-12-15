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
      m_waterProgram(0), m_terrainProgram(0),
      m_terrain_texture_id(0),
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

    m_terrainProgram = ResourceLoader::createShaderProgram(
                ":/shaders/terrain.vert", ":/shaders/terrain.frag");

    // (triangle strip, 4 vertices, position followed by UVs)
    std::vector<GLfloat> quadData = {
      -1, 1, 0,
        -1, -1, 0,
        1, 1, 0,
        1, -1, 0
    };
    m_quad = std::make_unique<OpenGLShape>();
    m_quad->setVertexData(&quadData[0], quadData.size(), VBO::LAYOUT_TRIANGLE_STRIP, 4);
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

    // terrain textures
    QImage image("/course/cs123/data/image/terrain/rock.JPG"); // TODO
    image = QGLWidget::convertToGLFormat(image);
    glGenTextures(1, &(m_terrain_texture_id));
    glBindTexture(GL_TEXTURE_2D, m_terrain_texture_id);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, image.width(), image.height(), 0, GL_RGBA, GL_UNSIGNED_BYTE, image.bits());

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
    glm::vec2 resoution = glm::vec2(width(), height());
    glUniform2fv(glGetUniformLocation(m_waterProgram, "resolution"), 1, glm::value_ptr(resoution));

    glViewport(0, 0, m_width, m_height);
    m_quad -> draw();
    glUseProgram(0);
    time++;
}

void GLWidget::drawParticles() {
    static int time = 0;
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glUseProgram(m_terrainProgram);
    glUniform1f(glGetUniformLocation(m_terrainProgram, "iTime"), time/60.f);
    glm::vec2 resoution = glm::vec2(width(), height());
    glUniform2fv(glGetUniformLocation(m_terrainProgram, "resolution"), 1, glm::value_ptr(resoution));

    glViewport(0, 0, m_width, m_height);
    m_quad -> draw();
    glUseProgram(0);
    time++;
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
    int maxDim = std::max(width(), height());
    int x = (width() - maxDim) / 2.0f;
    int y = (height() - maxDim) / 2.0f;
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
