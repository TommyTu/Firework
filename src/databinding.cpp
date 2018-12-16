#include "databinding.h"
#include <QVariant>


////////////////////////////////////////////////////////////////////////////////
// class IntBinding
////////////////////////////////////////////////////////////////////////////////

IntBinding* IntBinding::bindSliderAndTextbox(
        QSlider *slider, QLineEdit *textbox, int &value, int minValue, int maxValue)
{
    // Bind the slider, the textbox, and the value together
    IntBinding *binding = new IntBinding(value);
    connect(slider, SIGNAL(sliderMoved(int)), binding, SLOT(intChanged(int)));
    connect(textbox, SIGNAL(textChanged(QString)), binding, SLOT(stringChanged(QString)));
    connect(binding, SIGNAL(updateInt(int)), slider, SLOT(setValue(int)));
    connect(binding, SIGNAL(updateString(QString)), textbox, SLOT(setText(QString)));

    // Set the range and initial value
    slider->setMinimum(minValue);
    slider->setMaximum(maxValue);
    slider->setValue(value);
    textbox->setText(QString::number(value));

    return binding;
}

IntBinding* IntBinding::bindTextbox(QLineEdit *textbox, int &value) {
    // Bind the the textbox and the value together
    IntBinding *binding = new IntBinding(value);
    connect(textbox, SIGNAL(textChanged(QString)), binding, SLOT(stringChanged(QString)));

    // Set the initial value
    textbox->setText(QString::number(value));

    return binding;
}

void IntBinding::intChanged(int newValue) {
    if (m_value != newValue) {
        m_value = newValue;
        emit updateString(QString::number(m_value));
        emit dataChanged();
    }
}

void IntBinding::stringChanged(QString newValue) {
    int intValue = newValue.toInt();
    if (m_value != intValue) {
        m_value = intValue;
        emit updateInt(m_value);
        emit dataChanged();
    }
}


BoolBinding* BoolBinding::bindCheckbox(QCheckBox *checkbox, bool &value) {
    // Bind the checkbox and the value together
    BoolBinding *binding = new BoolBinding(value);
    connect(checkbox, SIGNAL(toggled(bool)), binding, SLOT(boolChanged(bool)));

    // Set the initial value
    checkbox->setChecked(value);

    return binding;
}

void BoolBinding::boolChanged(bool newValue) {
    m_value = newValue;
    emit dataChanged();
}


////////////////////////////////////////////////////////////////////////////////
// class ChoiceBinding
////////////////////////////////////////////////////////////////////////////////
ChoiceBinding* ChoiceBinding::bindRadioButtons(int numRadioButtons, int &value, ...) {
    // Create a button group from the variable argument list following initialValue
    QButtonGroup *buttonGroup = new QButtonGroup;
    va_list args;
    va_start(args, value);
    for (int id = 0; id < numRadioButtons; id++)
        buttonGroup->addButton(va_arg(args, QRadioButton *), id);
    va_end(args);

    // Bind the button group and the value together
    ChoiceBinding *binding = new ChoiceBinding(value);
    connect(buttonGroup, SIGNAL(buttonClicked(int)), binding, SLOT(intChanged(int)));

    // Set the initial value
    value = qMax(0, qMin(numRadioButtons - 1, value));
    buttonGroup->button(value)->click();

    return binding;
}

ChoiceBinding* ChoiceBinding::bindTabs(QTabWidget *tabs, int &value) {
    // Bind the tabs and the value together
    ChoiceBinding *binding = new ChoiceBinding(value);
    connect(tabs, SIGNAL(currentChanged(int)), binding, SLOT(intChanged(int)));

    // Set the initial value
    value = qMax(0, qMin(tabs->count() - 1, value));
    tabs->setCurrentIndex(value);

    return binding;
}

void ChoiceBinding::intChanged(int newValue) {
    m_value = newValue;
    emit dataChanged();
}
