import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Validation schema
const schema = yup.object().shape({
  title: yup.string().required('Title is required').min(3, 'Title must be at least 3 characters'),
  description: yup.string().required('Description is required').min(10, 'Description must be at least 10 characters'),
  status: yup.string().required('Status is required'),
  priority: yup.string().required('Priority is required'),
  assignedTo: yup.string().nullable(),
});

const BugForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      status: 'OPEN',
      priority: 'MEDIUM',
      assignedTo: '',
    }
  });

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      fetchBug(id);
    }
  }, [id]);

  const fetchBug = async (bugId) => {
    try {
      const response = await api.get(`/bugs/${bugId}`);
      const bug = response.data;
      setValue('title', bug.title);
      setValue('description', bug.description);
      setValue('status', bug.status);
      setValue('priority', bug.priority);
      setValue('assignedTo', bug.assignedTo || '');
    } catch (error) {
      toast.error('Failed to fetch bug details');
      navigate('/bugs');
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/bugs/${id}`, data);
        toast.success('Bug updated successfully');
      } else {
        await api.post('/bugs', data);
        toast.success('Bug created successfully');
      }
      navigate('/bugs');
    } catch (error) {
      toast.error(isEdit ? 'Failed to update bug' : 'Failed to create bug');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {isEdit ? 'Edit Bug' : 'Create New Bug'}
        </h2>
        <p className="text-gray-600 mt-1">
          {isEdit ? 'Update the bug details below' : 'Fill in the details to create a new bug'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-6">
        <div>
          <label className="label" htmlFor="title">
            Title *
          </label>
          <input
            id="title"
            type="text"
            {...register('title')}
            className={`input-field ${errors.title ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="Enter bug title"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="description">
            Description *
          </label>
          <textarea
            id="description"
            rows="4"
            {...register('description')}
            className={`input-field ${errors.description ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="Describe the bug in detail"
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label" htmlFor="status">
              Status *
            </label>
            <select
              id="status"
              {...register('status')}
              className={`input-field ${errors.status ? 'border-red-500 focus:ring-red-500' : ''}`}
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            {errors.status && (
              <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="priority">
              Priority *
            </label>
            <select
              id="priority"
              {...register('priority')}
              className={`input-field ${errors.priority ? 'border-red-500 focus:ring-red-500' : ''}`}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            {errors.priority && (
              <p className="mt-1 text-sm text-red-600">{errors.priority.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="assignedTo">
            Assigned To
          </label>
          <input
            id="assignedTo"
            type="text"
            {...register('assignedTo')}
            className="input-field"
            placeholder="Enter name of assignee"
          />
        </div>

        <div className="flex gap-4 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 btn-primary py-3"
          >
            {loading ? 'Saving...' : (isEdit ? 'Update Bug' : 'Create Bug')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/bugs')}
            className="flex-1 btn-secondary py-3"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default BugForm;