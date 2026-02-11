import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, message, Select, Steps } from 'antd';
import React, { useState } from 'react';
import { history } from '@umijs/max';

/**
 * 发起训练页
 */
const TaskCreate: React.FC = () => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    form.validateFields().then(() => {
      setCurrentStep(currentStep + 1);
    });
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (values: any) => {
    try {
      // TODO: 调用接口 POST /api/task/create
      console.log('创建任务参数:', values);
      message.success('任务创建成功！');
      history.push('/task/list');
    } catch (error) {
      message.error('创建失败，请重试！');
    }
  };

  const steps = [
    {
      title: '选择模型',
      content: (
        <Form.Item
          name="modelId"
          label="模型"
          rules={[{ required: true, message: '请选择模型' }]}
        >
          <Select placeholder="请选择模型">
            {/* TODO: 调用接口 GET /api/model/options */}
          </Select>
        </Form.Item>
      ),
    },
    {
      title: '选择数据集',
      content: (
        <Form.Item
          name="datasetId"
          label="数据集"
          rules={[{ required: true, message: '请选择数据集' }]}
        >
          <Select placeholder="请选择数据集">
            {/* TODO: 调用接口 GET /api/dataset/options，根据模型类型筛选 */}
          </Select>
        </Form.Item>
      ),
    },
    {
      title: '配置参数',
      content: (
        <Form.Item
          name="params"
          label="训练参数（JSON格式）"
          rules={[{ required: true, message: '请输入训练参数' }]}
        >
          {/* TODO: 使用 JsonEditor 组件 */}
          <textarea
            placeholder='{"epochs": 10, "batch_size": 32}'
            style={{ width: '100%', minHeight: 200 }}
          />
        </Form.Item>
      ),
    },
  ];

  return (
    <PageContainer
      title="发起训练"
      onBack={() => history.push('/task/list')}
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 200, marginBottom: 24 }}>
          {steps[currentStep].content}
        </div>
        <div>
          {currentStep > 0 && (
            <Button onClick={handlePrev} style={{ marginRight: 8 }}>
              上一步
            </Button>
          )}
          {currentStep < steps.length - 1 ? (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          ) : (
            <Button type="primary" htmlType="submit">
              提交训练
            </Button>
          )}
        </div>
      </Form>
    </PageContainer>
  );
};

export default TaskCreate;






